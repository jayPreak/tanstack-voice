// src/ws.ts
import { defineEventHandler, defineWebSocket } from '@tanstack/react-start/server';
console.log("MEOWMEOW")
export default defineEventHandler({
  
  // Regular HTTP handler is left empty since we use WebSocket
  handler() {},
  

  // Define the WebSocket logic
  websocket: defineWebSocket({
    
    // Called when a client first establishes a WebSocket connection.
    open(peer) {
      console.log("WebSocket connection opened. Peer ID:", peer.id);
      // Send a greeting message
      peer.send("Hello from TanStack Start WebSocket server!");
    },

    // Called each time a message is received from the client.
    message(peer, msg) {
      // Log the incoming message (convert Buffer to string if needed)
      const incoming = msg.toString();
      console.log("Received message:", incoming);
      // For example, echo the message back to the client
      peer.send(`Echo: ${incoming}`);
    },

    // Called when the WebSocket connection is closed.
    close(peer, details) {
      console.log("WebSocket connection closed. Peer ID:", peer.id);
      if (details && details.reason) {
        console.log("Close reason:", details.reason);
      }
    },

    // Optional: Error handling, if needed.
    error(peer, err) {
      console.error("WebSocket error for peer", peer.id, err);

    },
  }),
});
