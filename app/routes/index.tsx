import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { Button } from "../components/button";
import { Mic, MicOff, Play, RotateCw } from "lucide-react";

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
  const [isAiTyping, setIsAiTyping] = useState(false); // New state for AI typing indicator
  const [messages, setMessages] = useState<
    Array<{ type: string; content: string; timestamp: string }>
  >([
    {
      type: "assistant",
      content: "Hi there! How can I help you today?",
      timestamp: "04:24 PM",
    },
  ]);
  const [isLoading, setIsLoading] = useState(false);

  const getPreferredAudioFormat = (): { mimeType: string; format: string } => {
    const candidates = [
      { mimeType: "audio/webm;codecs=opus", format: "webm" },
      { mimeType: "audio/mp4", format: "m4a" },
      { mimeType: "audio/ogg;codecs=opus", format: "ogg" },
    ];

    for (const candidate of candidates) {
      if (
        typeof MediaRecorder !== "undefined" &&
        MediaRecorder.isTypeSupported(candidate.mimeType)
      ) {
        return candidate;
      }
    }

    return { mimeType: "audio/mp4", format: "m4a" }; // Common fallback
  };

  const sendPlay = () => {
    setIsLoading(true);
    wsRef.current?.send(
      JSON.stringify({
        type: "play_sample",
        filename: "harvard.wav",
      })
    );
    setMessages((prev) => [
      ...prev,
      {
        type: "user",
        content: "Playing harvard.wav",
        timestamp: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      },
    ]);
  };

  const connect = () => {
    setStatus("Connecting...");
    const wsUrl = import.meta.env.VITE_WEBSOCKET_URL;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus("Connected");
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log({ data });

        if (data.event === "media" && data.media && data.media.payload) {
          setIsLoading(false);
          setIsAiTyping(true);

          setTimeout(() => {
            setResponse(data.media.payload);
            setStatus("Received media payload!");
            setIsAiTyping(false);
          }, 1500);
        } else if (data.type === "message") {
          setResponse(data.message);
          setStatus("Received message");

          setMessages((prev) => [
            ...prev,
            {
              type: "assistant",
              content: data.message,
              timestamp: new Date().toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              }),
            },
          ]);
        } else if (data.type === "system") {
          setResponse(data.message);
          setStatus("System: " + data.message);
        } else {
          setResponse(`${JSON.stringify(data)}`);
          setStatus("Data received");
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
        const { format: recordedFormat } = getPreferredAudioFormat();
        const recordedMimeType =
          mediaRecorderRef.current?.mimeType || `audio/${recordedFormat}`;
        const audioBlob = new Blob(audioChunks, { type: recordedMimeType });
        const url = URL.createObjectURL(audioBlob);
        setAudioUrl(url);

        setMessages((prev) => [
          ...prev,
          {
            type: "user",
            content: "audio",
            timestamp: new Date().toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            }),
          },
        ]);

        setIsAiTyping(true);

        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = () => {
          if (typeof reader.result === "string") {
            const base64Audio = reader.result.split(",")[1];
            // Call sendMessage with audio data and the placeholder ID
            wsRef.current?.send(
              JSON.stringify({
                type: "send_audio",
                audio: base64Audio,
              })
            );
          } else {
            console.log("Failed to read audio blob as base64 data URL.");
          }
        };

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

  const TypingIndicator = () => (
    <div className="flex justify-start">
      <div className="max-w-[70%] bg-slate-800 rounded-tl-none rounded-2xl p-4 backdrop-blur-lg bg-opacity-80 shadow-lg">
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <div className="bg-indigo-500 rounded-full p-1">
              <svg
                className="w-4 h-4 text-white"
                fill="none"
                viewBox="0 0 24 24"
              >
                <path
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M12 2L4 6V18L12 22L20 18V6L12 2Z"
                ></path>
              </svg>
            </div>
            <span className="text-xs text-slate-400">AI Assistant</span>
            <span className="text-xs text-slate-500">
              {new Date().toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>
          <div className="flex space-x-2">
            <div
              className="w-2 h-2 bg-slate-500 rounded-full animate-bounce"
              style={{ animationDelay: "0ms" }}
            ></div>
            <div
              className="w-2 h-2 bg-slate-500 rounded-full animate-bounce"
              style={{ animationDelay: "200ms" }}
            ></div>
            <div
              className="w-2 h-2 bg-slate-500 rounded-full animate-bounce"
              style={{ animationDelay: "400ms" }}
            ></div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-screen bg-slate-900 text-white">
      <div className="border-b border-slate-700 p-4">
        <div className="flex items-center space-x-3 max-w-6xl mx-auto">
          <div className="bg-indigo-500 rounded-full p-2">
            <div className="text-white">
              <svg
                className="w-6 h-6"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M12 2L4 6V18L12 22L20 18V6L12 2Z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M12 22V14"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M20 6L12 10L4 6"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M12 10L12 14"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          </div>
          <div>
            <h1 className="text-xl font-bold">Tanstack voice</h1>
            <p className="text-sm text-slate-400">Powered by AI</p>
          </div>
          <div className="ml-auto flex items-center space-x-2">
            <span className="text-xs bg-slate-800 px-2 py-1 rounded">
              Status: {status}
            </span>
            <Button variant="outline" size="sm" onClick={connect}>
              <RotateCw className="w-4 h-4 mr-2" />
              Connect
            </Button>
            <Button variant="outline" size="sm" onClick={sendPlay}>
              {isLoading ? (
                <svg className="animate-spin h-4 w-4 mr-2" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                  ></path>
                </svg>
              ) : (
                <Play className="w-4 h-4 mr-2" />
              )}
              Play Sample
            </Button>
          </div>
        </div>
      </div>

      {/* Chat Container */}
      <div className="flex-1 overflow-y-auto p-4 bg-slate-900 max-w-6xl mx-auto w-full">
        <div className="space-y-4">
          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`flex ${msg.type === "assistant" ? "justify-start" : "justify-end"}`}
            >
              <div
                className={`max-w-[70%] ${
                  msg.type === "assistant"
                    ? "bg-slate-800 rounded-tl-none"
                    : "bg-indigo-600 rounded-tr-none"
                } rounded-2xl p-4 backdrop-blur-lg bg-opacity-80 shadow-lg`}
              >
                {msg.type === "assistant" ? (
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <div className="bg-indigo-500 rounded-full p-1">
                        <svg
                          className="w-4 h-4 text-white"
                          fill="none"
                          viewBox="0 0 24 24"
                        >
                          <path
                            stroke="currentColor"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M12 2L4 6V18L12 22L20 18V6L12 2Z"
                          ></path>
                        </svg>
                      </div>
                      <span className="text-xs text-slate-400">
                        AI Assistant
                      </span>
                      <span className="text-xs text-slate-500">
                        {msg.timestamp}
                      </span>
                    </div>
                    {msg.content === "audio" ? (
                      <div className="mt-2">
                        <audio
                          className="w-64 h-10"
                          controls
                          src={audioUrl || undefined}
                        />
                      </div>
                    ) : (
                      <p className="text-white text-sm">{msg.content}</p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-indigo-200">You</span>
                      <span className="text-xs text-indigo-300">
                        {msg.timestamp}
                      </span>
                    </div>
                    {msg.content === "Playing harvard.wav" ? (
                      <div className="mt-2">
                        <p className="text-white text-sm mb-2">Sample Audio</p>
                        <audio
                          className="w-64 h-10"
                          controls
                          src={"harvard.wav"}
                        />
                      </div>
                    ) : msg.content === "audio" ? (
                      <div className="mt-2">
                        <audio
                          className="w-64 h-10"
                          controls
                          src={audioUrl || undefined}
                        />
                      </div>
                    ) : (
                      <p className="text-white text-sm">{msg.content}</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}

          {isAiTyping && <TypingIndicator />}
        </div>
      </div>

      <div className="border-t border-slate-700 p-4">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center relative">
            <div className="relative flex-1">
              <Button
                variant={isRecording ? "destructive" : "ghost"}
                size="icon"
                onClick={isRecording ? stopRecording : startRecording}
                className="w-full bg-indigo-600 rounded-full py-3 px-5 pr-12"
              >
                {isRecording ? (
                  <MicOff className="h-5 w-5" />
                ) : (
                  <Mic className="h-5 w-5" />
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
