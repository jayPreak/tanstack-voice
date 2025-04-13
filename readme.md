# TanStack Voice Project

This project consists of a client-side application and a WebSocket server for voice functionality.

## Prerequisites

- Node.js (latest LTS version recommended)
- npm (comes with Node.js)

## Setup

1. Clone the repository:
```bash
git clone https://github.com/jayPreak/tanstack-voice.git
cd tanstack-voice
```

2. Install dependencies:
```bash
npm install
```

3. Environment Setup:
Create a `.env` file in the root directory and add your OpenAI API key:
```bash
OPENAI_API_KEY=your_openai_api_key
```

## Running the Application

The application consists of two parts that need to be run separately:

### Client Side
Run the client-side application with:
```bash
npm run dev
```
The client will be available at: `http://localhost:3000`

### Server Side
In a separate terminal, run the WebSocket server with:
```bash
node server.js
```
The WebSocket server will be running at: `ws://localhost:8080`

## Development

Keep both the client and server running for full functionality. You'll need two terminal windows/tabs:
- Terminal 1: Running the client (`npm run dev`)
- Terminal 2: Running the WebSocket server (`node server.js`)

## Environment Variables

The application requires an OpenAI API key to function. Make sure to:
1. Create a `.env` file in the project root
2. Add your OpenAI API key in the following format:
```bash
OPENAI_API_KEY=your_openai_api_key
```
⚠️ Never commit your `.env` file to version control.

![70005](https://github.com/user-attachments/assets/6b14395e-579a-40f1-b4dc-1214f76c97e2)
