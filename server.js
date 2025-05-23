import { WebSocketServer, WebSocket } from "ws";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import decodeAudio from "audio-decode";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { OpenAI } from "openai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

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

function floatTo16BitPCM(float32Array) {
  const buffer = new ArrayBuffer(float32Array.length * 2);
  const view = new DataView(buffer);
  let offset = 0;
  for (let i = 0; i < float32Array.length; i++, offset += 2) {
    let s = Math.max(-1, Math.min(1, float32Array[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buffer;
}

function base64EncodeAudio(float32Array) {
  const arrayBuffer = floatTo16BitPCM(float32Array);
  let binary = "";
  let bytes = new Uint8Array(arrayBuffer);
  const chunkSize = 0x8000; // 32KB chunk size
  for (let i = 0; i < bytes.length; i += chunkSize) {
    let chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, chunk);
  }
  return btoa(binary);
}

const files = ["./public/sports.wav", "./public/harvard.wav"];

const port = process.env.PORT || 8080;
const wss = new WebSocketServer({ port });
console.log(`WebSocket server started on port ${port}`);

let session = {
  frontendConn: null,
  openaiConn: null,
  isConnecting: false,
};

wss.on("connection", (ws) => {
  let fileCounter = 0;
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
        console.log(`OpenAI event:`, message.type);
        console.log(JSON.stringify(message, null, 2));
      }
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
  ws.on("message", async (message) => {
    try {
      const data = JSON.parse(message.toString());
      console.log(`Received from frontend:`, data.type);

      switch (data.type) {
        case "play_sample":
          for (const filename of files) {
            console.log("Playing sample:", filename);
            const audioFile = fs.readFileSync(filename);
            console.log({ audioFile });
            const audioBuffer = await decodeAudio(audioFile);
            const channelData = audioBuffer.getChannelData(0);
            const base64Chunk = base64EncodeAudio(channelData);
            openAiWs.send(
              JSON.stringify({
                type: "input_audio_buffer.append",
                audio: base64Chunk,
              })
            );
          }

          openAiWs.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
          console.log("Sample audio sent to OpenAI");
          break;
        case "send_audio":
          console.log({ data });
          const audioBuffer = Buffer.from(data.audio, "base64");
          const tempPath = path.join(__dirname, "temp.webm");
          fs.writeFileSync(tempPath, audioBuffer);

          const transcription = await openai.audio.transcriptions.create({
            file: fs.createReadStream(tempPath),
            model: "whisper-1",
            response_format: "text",
          });

          fs.unlinkSync(tempPath);

          console.log({ transcription });
          // openAiWs.send(
          //   JSON.stringify({
          //     type: "input_audio_buffer.append",
          //     audio: base64Chunk,
          //   })
          // );

          // openAiWs.send(JSON.stringify({ type: "input_audio_buffer.commit" }));

          // console.log("Sending full audio message to OpenAI...");
          const eventToSend = {
            type: "conversation.item.create",
            item: {
              type: "message",
              role: "user",
              content: [
                {
                  type: "input_text",
                  text: transcription,
                },
              ],
            },
          };
          openAiWs.send(JSON.stringify(eventToSend));
          console.log("Recorded Aaudio sent to OpenAI");
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
