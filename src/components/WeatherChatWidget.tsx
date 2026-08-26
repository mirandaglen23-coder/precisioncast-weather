import React, { useState, useRef, useEffect } from "react";
import {
  MessageSquare,
  X,
  Send,
  Sparkles,
  Bot,
  User,
  ChevronDown,
  Trash2,
  HelpCircle,
  Umbrella,
  Shirt,
  Flame,
  Wind,
  Sun,
  Activity,
} from "lucide-react";
import Markdown from "react-markdown";
import { PrecisionForecastResponse, WeatherChatMessage } from "../types";
import { formatTemp } from "../utils/weatherUtils";

interface WeatherChatWidgetProps {
  forecast: PrecisionForecastResponse | null;
  tempUnit?: "C" | "F";
}

const QUICK_PROMPTS = [
  { label: "👀 What would it look like standing here?", text: "What would it look and feel like to somebody standing outside here right now?" },
  { label: "🧥 What should I wear?", text: "What should I wear for today's weather conditions?" },
  { label: "☔ Will it rain soon?", text: "Is it going to rain in the next 2-3 hours? Will I need an umbrella?" },
  { label: "🏃 Good for a run or outdoor workout?", text: "Is it good weather right now for outdoor running or exercise?" },
  { label: "💨 How does humidity & wind feel?", text: "How does the air feel right now in terms of humidity, mugginess, and wind?" },
];

export const WeatherChatWidget: React.FC<WeatherChatWidgetProps> = ({
  forecast,
  tempUnit = "F",
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [inputMessage, setInputMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<WeatherChatMessage[]>([
    {
      id: "welcome-1",
      role: "assistant",
      content:
        "👋 **Hi there!** I'm your local AI Weather Assistant. Ask me anything in everyday terms — like what to wear, if you'll need an umbrella, outdoor activity conditions, or how the air feels!",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    },
  ]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isOpen]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 150);
    }
  }, [isOpen]);

  const handleSendMessage = async (textToSend?: string) => {
    const query = (textToSend || inputMessage).trim();
    if (!query || isLoading || !forecast) return;

    const userMsg: WeatherChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: query,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInputMessage("");
    setIsLoading(true);

    try {
      // Build history for context
      const history = newMessages
        .filter((m) => m.id !== "welcome-1")
        .slice(-6)
        .map((m) => ({
          role: m.role,
          content: m.content,
        }));

      const res = await fetch("/api/gemini/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: query,
          history,
          forecast,
        }),
      });

      const contentType = res.headers.get("content-type") || "";
      if (!res.ok || !contentType.includes("application/json")) {
        throw new Error(`Weather assistant unavailable (${res.status})`);
      }

      const data = await res.json();
      const assistantMsg: WeatherChatMessage = {
        id: `ai-${Date.now()}`,
        role: "assistant",
        content: data.reply || "I analyzed your location's weather, but had trouble generating a reply. Please try again!",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: any) {
      console.error("Chat error:", err);
      const errorMsg: WeatherChatMessage = {
        id: `err-${Date.now()}`,
        role: "assistant",
        content: "⚠️ Sorry, I ran into an issue connecting with the weather assistant. Please try asking again in a moment.",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleClearHistory = () => {
    setMessages([
      {
        id: `welcome-${Date.now()}`,
        role: "assistant",
        content:
          "✨ Chat cleared! Ask me anything about the local forecast, clothing recommendations, or rain timing.",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      },
    ]);
  };

  const locationTitle =
    forecast?.coordinates.locationName ||
    (forecast
      ? `(${forecast.coordinates.latitude.toFixed(2)}°, ${forecast.coordinates.longitude.toFixed(2)}°)`
      : "Current Location");

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end pointer-events-none">
      {/* Expanded Chatbox Window */}
      {isOpen && (
        <div
          id="weather-chat-window"
          className="pointer-events-auto w-[92vw] sm:w-[410px] h-[520px] max-h-[82vh] bg-slate-900/95 backdrop-blur-xl border border-slate-700/80 rounded-3xl shadow-2xl flex flex-col overflow-hidden mb-3 animate-in slide-in-from-bottom-5 duration-200"
        >
          {/* Header */}
          <div className="bg-slate-950/80 border-b border-slate-800 p-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                <Sparkles className="w-4 h-4 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm text-white">Weather Assistant</span>
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    Online
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 truncate max-w-[200px]">
                  {locationTitle}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={handleClearHistory}
                title="Clear chat history"
                className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              <button
                onClick={() => setIsOpen(false)}
                title="Minimize chat"
                className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Location Telemetry Mini-Strip */}
          {forecast && (
            <div className="bg-slate-950/40 px-4 py-2 border-b border-slate-800/60 flex items-center justify-between text-[11px] text-slate-400 font-mono">
              <div className="flex items-center gap-1.5">
                <span className="text-cyan-400 font-semibold">
                  {formatTemp(forecast.current.temperature, tempUnit)}
                </span>
                <span>•</span>
                <span className="text-slate-300 capitalize">
                  {forecast.current.weatherDescription}
                </span>
              </div>
              <div className="text-slate-400">
                Humidity: <span className="text-slate-200">{forecast.current.humidity}%</span>
              </div>
            </div>
          )}

          {/* Messages Scroll Area */}
          <div className="flex-1 p-4 overflow-y-auto space-y-3.5 scrollbar-thin scrollbar-thumb-slate-700">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-2.5 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {msg.role === "assistant" && (
                  <div className="w-6 h-6 rounded-lg bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center text-cyan-400 flex-shrink-0 mt-0.5">
                    <Bot className="w-3.5 h-3.5" />
                  </div>
                )}

                <div
                  className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed ${
                    msg.role === "user"
                      ? "bg-gradient-to-r from-cyan-600 to-cyan-500 text-white rounded-br-none shadow-md"
                      : "bg-slate-950/80 border border-slate-800/90 text-slate-200 rounded-bl-none shadow-sm"
                  }`}
                >
                  {msg.role === "assistant" ? (
                    <div className="markdown-body space-y-1.5 break-words">
                      <Markdown>{msg.content}</Markdown>
                    </div>
                  ) : (
                    <p className="break-words">{msg.content}</p>
                  )}
                  <div
                    className={`text-[9px] mt-1 text-right font-mono ${
                      msg.role === "user" ? "text-cyan-200/80" : "text-slate-500"
                    }`}
                  >
                    {msg.timestamp}
                  </div>
                </div>

                {msg.role === "user" && (
                  <div className="w-6 h-6 rounded-lg bg-cyan-600/30 border border-cyan-500/40 flex items-center justify-center text-cyan-200 flex-shrink-0 mt-0.5">
                    <User className="w-3.5 h-3.5" />
                  </div>
                )}
              </div>
            ))}

            {/* Loading Indicator */}
            {isLoading && (
              <div className="flex gap-2.5 justify-start">
                <div className="w-6 h-6 rounded-lg bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center text-cyan-400 flex-shrink-0 mt-0.5">
                  <Bot className="w-3.5 h-3.5" />
                </div>
                <div className="bg-slate-950/80 border border-slate-800/90 text-slate-400 rounded-2xl rounded-bl-none px-3.5 py-2.5 text-xs flex items-center gap-2">
                  <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                  <span className="text-[11px] font-mono text-cyan-300">Checking conditions...</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Quick Prompts Carousel */}
          <div className="px-3 py-2 bg-slate-950/60 border-t border-slate-800/80 overflow-x-auto flex gap-1.5 no-scrollbar">
            {QUICK_PROMPTS.map((p, idx) => (
              <button
                key={idx}
                onClick={() => handleSendMessage(p.text)}
                disabled={isLoading}
                className="whitespace-nowrap text-[11px] font-medium px-2.5 py-1 rounded-full bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 hover:text-white transition disabled:opacity-50 flex-shrink-0"
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Input Form */}
          <div className="p-3 bg-slate-950/90 border-t border-slate-800 flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              value={inputMessage ?? ""}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about clothing, rain, outdoor plans..."
              disabled={isLoading}
              className="flex-1 bg-slate-900/90 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition disabled:opacity-60"
            />
            <button
              onClick={() => handleSendMessage()}
              disabled={!inputMessage.trim() || isLoading}
              className="p-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center justify-center shadow-md"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Floating Toggle Button */}
      <button
        id="open-weather-chat-btn"
        onClick={() => setIsOpen((prev) => !prev)}
        className="pointer-events-auto px-4 py-2.5 rounded-full bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 text-slate-950 font-bold text-xs shadow-xl flex items-center gap-2.5 border border-cyan-400/40 transition-transform active:scale-95 group"
      >
        <div className="relative">
          <MessageSquare className="w-4 h-4 text-slate-950" />
          <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
          <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-300" />
        </div>
        <span>{isOpen ? "Close Assistant" : "Ask AI Weather Assistant"}</span>
        <Sparkles className="w-3.5 h-3.5 text-cyan-950 group-hover:rotate-12 transition-transform" />
      </button>
    </div>
  );
};
