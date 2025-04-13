import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";

export const Route = createFileRoute("/")({
  component: WebSocketTest,
});

function WebSocketTest() {
  const [response, setResponse] = useState<string | null>(null);
  const [status, setStatus] = useState("Disconnected");
  const wsRef = useRef<WebSocket | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

  const sendPlay = () => {
    wsRef.current?.send(
      JSON.stringify({
        type: "play_sample",
        filename: "harvard.wav",
      })
    );
  };

  const connect = () => {
    setStatus("Connecting...");
    const wsUrl = import.meta.env.VITE_WEBSOCKET_URL || "ws://localhost:8080";
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus("Connected! Sending sample request...");
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log({ data });
        console.log("fuck");

        if (data.event === "media" && data.media && data.media.payload) {
          setResponse(data.media.payload);
          setStatus("Received media payload!");
        } else if (data.type === "message") {
          console.log("WHAT");
          setResponse(data.message);
          setStatus("Received text message!");
        } else if (data.type === "system") {
          // console.log(data.message)
          setResponse(data.message);
          setStatus("Received system message!");
        } else {
          setResponse(`Other data received: ${JSON.stringify(data)}`);
          setStatus("Received data");
        }
      } catch (error) {
        console.error("Error parsing response:", error);
        setStatus("Error parsing response");
      }
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
      setStatus("Connection error");
    };
    ws.onclose = () => {
      setStatus("Disconnected");
    };
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      const audioChunks = [];
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunks.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunks, { type: "audio/wav" });
        const url = URL.createObjectURL(audioBlob);
        setAudioUrl(url);

        const reader = new FileReader();

        reader.onloadend = () => {
          const base64Audio = reader.result?.split(",")[1]; // Remove data URL prefix
          // Send base64Audio to backend via WebSocket
          wsRef.current?.send(
            JSON.stringify({
              type: "send_audio",
              audio: base64Audio,
            })
          );
        };
        reader.readAsDataURL(audioBlob);

        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error("Error accessing microphone:", error);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  return (
    <div
      style={{
        maxWidth: "800px",
        margin: "40px auto",
        padding: "20px",
        fontFamily: "Arial, sans-serif",
        textAlign: "center",
      }}
    >
      <h1>WebSocket Sample Audio Test</h1>

      <div style={{ margin: "20px 0" }}>
        <p>
          Status: <strong>{status}</strong>
        </p>
      </div>

      <button
        onClick={connect}
        style={{
          padding: "12px 24px",
          fontSize: "16px",
          backgroundColor: "#4CAF50",
          color: "white",
          border: "none",
          borderRadius: "4px",
          cursor: "pointer",
          margin: "20px 0",
        }}
      >
        Connect
      </button>

      <button
        onClick={sendPlay}
        style={{
          padding: "12px 24px",
          fontSize: "16px",
          backgroundColor: "#4CAF50",
          color: "white",
          border: "none",
          borderRadius: "4px",
          cursor: "pointer",
          margin: "20px 0",
        }}
      >
        Play Sample
      </button>
      <div style={{ margin: "20px 0" }}>
        <p>
          Status: <strong>{isRecording ? "Recording..." : "Ready"}</strong>
        </p>
      </div>
      <button
        onClick={isRecording ? stopRecording : startRecording}
        style={{
          padding: "12px 24px",
          fontSize: "16px",
          backgroundColor: isRecording ? "#f44336" : "#FF5722",
          color: "white",
          border: "none",
          borderRadius: "4px",
          cursor: "pointer",
          margin: "20px 0",
        }}
      >
        {isRecording ? "Stop Recording" : "Record Audio"}
      </button>

      {audioUrl && (
        <div style={{ marginTop: "20px" }}>
          <h3>Recorded Audio:</h3>
          <audio controls src={audioUrl} style={{ width: "100%" }} />
        </div>
      )}

      {response && (
        <div
          style={{
            marginTop: "30px",
            padding: "15px",
            backgroundColor: "#f5f5f5",
            borderRadius: "4px",
            border: "1px solid #ddd",
            textAlign: "left",
            wordBreak: "break-all",
          }}
        >
          <h3>Received Payload:</h3>
          <p
            style={{ fontSize: "14px", maxHeight: "300px", overflowY: "auto" }}
          >
            {response}
          </p>
        </div>
      )}
    </div>
  );
}
