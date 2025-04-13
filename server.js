// server.js - Minimal OpenAI Realtime WebSocket server
import { WebSocketServer, WebSocket } from "ws";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
dotenv.config();
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const LOG_EVENT_TYPES = [
  "response.content.done",
  "rate_limits.updated",
  "response.done",
  "input_audio_buffer.committed",
  "input_audio_buffer.speech_stopped",
  "input_audio_buffer.speech_started",
  "session.created",
  "response.text.done",
  "conversation.item.input_audio_transcription.completed",
];
const wss = new WebSocketServer({ port: 8080 });
console.log("WebSocket server started on port 8080");

// Single session for simplicity
let session = {
  frontendConn: null,
  openaiConn: null,
  isConnecting: false,
};

// Handle new connections from frontend
wss.on("connection", (ws) => {
  console.log("Frontend client connected");

  // Store frontend connection
  session.frontendConn = ws;

  // Send initial system message
  jsonSend(ws, {
    type: "system",
    message: "Connected to WebSocket server",
  });
  const openAiWs = new WebSocket(
    "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview",
    {
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "OpenAI-Beta": "realtime=v1",
      },
    }
  );

  const sendSessionUpdate = () => {
    const sessionUpdate = {
      type: "session.update",
      session: {
        turn_detection: { type: "server_vad" },
        input_audio_format: "g711_ulaw",
        output_audio_format: "g711_ulaw",
        // voice: VOICE,
        // instructions: SYSTEM_MESSAGE,
        modalities: ["text", "audio"],
        temperature: 0.8,
        input_audio_transcription: {
          model: "whisper-1",
        },
      },
    };

    console.log("Sending session update:", JSON.stringify(sessionUpdate));
    openAiWs.send(JSON.stringify(sessionUpdate));
  };

  openAiWs.on("open", () => {
    console.log("Connected to the OpenAI Realtime API");
    setTimeout(sendSessionUpdate, 250);
  });
  openAiWs.on("message", (data) => {
    try {
      const message = JSON.parse(data);
      if (LOG_EVENT_TYPES.includes(message.type)) {
        console.log(`Received event: ${message.type}`, message);
      }

      if (message.type === "response.done") {
        const agentMessage =
          message.response.output[0]?.content?.find(
            (content) => content.transcript
          )?.transcript || "Agent message not found";
        session.transcript += `Agent: ${agentMessage}\n`;
        console.log(`Agent (${session.id}): ${agentMessage}`);
        jsonSend(ws, {
          type: "message",
          message: agentMessage,
        });
      }
      if (message.type === "session.updated") {
        console.log("Session updated successfully:", message);
      }
      if (message.type === "response.audio.delta" && message.delta) {
        const audioDelta = {
          event: "media",
          streamSid: session.streamSid,
          media: {
            payload: Buffer.from(message.delta, "base64").toString("base64"),
          },
        };
        ws.send(JSON.stringify(audioDelta));
      }
      if (message.type === "conversation.item.created") {
        const responseCreateEvent = {
          type: "response.create",
        };
        openAiWs.send(JSON.stringify(responseCreateEvent));
      }
      if (message.type !== "response.audio.delta") {
        console.log("fuck");
        console.log({ message });
        console.log(`OpenAI event:`, message.type);
        console.log(JSON.stringify(message, null, 2));
      }
      console.log("hiiiiii what", message.type);
    } catch (error) {
      console.error(
        "Error processing OpenAI message:",
        error,
        "Raw message:",
        data
      );
    }
  });

  // Handle messages from frontend
  ws.on("message", (message) => {
    try {
      const data = JSON.parse(message.toString());
      console.log(`Received from frontend:`, data.type);

      switch (data.type) {
        case "media":
          if (openAiWs.readyState === WebSocket.OPEN) {
            const audioAppend = {
              type: "input_audio_buffer.append",
              audio: data.media.payload,
            };

            openAiWs.send(JSON.stringify(audioAppend));
          }
          break;
        case "play_sample":
          const filePath = path.join(process.cwd(), "public", "harvard.wav");
          console.log(`Reading sample audio from ${filePath}`);

          const audioData = fs.readFileSync(filePath);
          const base64Audio = audioData.toString("base64");

          console.log("Sending full audio message to OpenAI...");
          const event = {
            type: "conversation.item.create",
            item: {
              type: "message",
              role: "user",
              content: [
                {
                  type: "input_audio",
                  // type: "input_text",
                  audio: base64Audio,
                  // text: "Hiiii can you please respond to this I like peanut butter a lot :D",
                },
              ],
            },
          };
          //   type: "conversation.item.create",
          //   item: {
          //     type: "message",
          //     role: "user",
          //     content: [
          //       {
          //         type: "input_audio",
          //         // type: "input_text",
          //         audio: base64Audio,
          //         // text: "Hiiii can you please respond to this I like peanut butter a lot :D"
          //       },
          //     ],
          //   },
          // });
          openAiWs.send(JSON.stringify(event));
          console.log("Sample audio sent to OpenAI");
        case "send_audio":
          console.log({ data });
          const audioString = data.audio;

          console.log("Sending full audio message to OpenAI...");
          const eventToSend = {
            type: "conversation.item.create",
            item: {
              type: "message",
              role: "user",
              content: [
                {
                  type: "input_audio",
                  // type: "input_text",
                  audio: audioString,
                  // text: "Hiiii can you please respond to this I like peanut butter a lot :D",
                },
              ],
            },
          };
          openAiWs.send(JSON.stringify(eventToSend));
          console.log("Sample audio sent to OpenAI");

        // if (session.frontendConn && isOpen(session.frontendConn)) {
        //   jsonSend(session.frontendConn, {
        //     type: "system",
        //     message: "Sample audio sent to OpenAI",
        //   });
        // }
        case "start":
          session.streamSid = data.start.streamSid;
          console.log("Incoming stream has started", session.streamSid);
          break;
        default:
          console.log("Received non-media event:", data.type);
          break;
      }
    } catch (error) {
      console.error("Error parsing message:", error, "Message:", message);
    }
  });

  // Handle frontend disconnection
  ws.on("close", () => {
    console.log("Frontend client disconnected");
    session.frontendConn = null;

    // Clean up OpenAI connection if frontend disconnects
    if (session.openaiConn) {
      session.openaiConn.close();
      session.openaiConn = null;
    }
  });

  ws.on("error", (error) => {
    console.error("Frontend connection error:", error);
    session.frontendConn = null;

    // Clean up OpenAI connection on error
    if (session.openaiConn) {
      session.openaiConn.close();
      session.openaiConn = null;
    }
  });

  openAiWs.on("close", () => {
    console.log("Disconnected from the OpenAI Realtime API");
  });

  openAiWs.on("error", (error) => {
    console.error("Error in the OpenAI WebSocket:", error);
  });
});

// Helper: Send JSON message
function jsonSend(ws, obj) {
  if (isOpen(ws)) {
    console.log("hii?", obj);
    ws.send(JSON.stringify(obj));
  }
}

// Helper: Check if WebSocket is open
function isOpen(ws) {
  return ws && ws.readyState === WebSocket.OPEN;
}
