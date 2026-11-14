"use client";

import React, { useState, useEffect } from "react";
import { Settings, Check, RotateCcw, X } from "lucide-react";
import { getBackendUrl, setCustomBackendUrl } from "../lib/config";

interface BackendSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const BackendSettingsModal: React.FC<BackendSettingsModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [url, setUrl] = useState<string>("");
  const [saved, setSaved] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      setUrl(getBackendUrl());
      setSaved(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setCustomBackendUrl(url.trim());
    setSaved(true);
    setTimeout(() => {
      onClose();
      window.location.reload();
    }, 400);
  };

  const handleReset = () => {
    setCustomBackendUrl("");
    setUrl(getBackendUrl());
    setSaved(true);
    setTimeout(() => {
      onClose();
      window.location.reload();
    }, 400);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl p-6 text-neutral-100">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <Settings className="w-5 h-5" />
            </div>
            <h3 className="font-semibold text-lg text-white">Backend Settings</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs text-neutral-400 mb-5 leading-relaxed">
          Specify the central FastAPI backend URL. By default, it auto-detects your
          current host on port 8000. If you are using Cloudflare Tunnel, ngrok, or a
          remote IP, enter it below.
        </p>

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-neutral-300 mb-1.5">
              Backend Endpoint (HTTP/HTTPS)
            </label>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="http://192.168.1.50:8000 or https://..."
              className="w-full px-3.5 py-2.5 bg-neutral-950 border border-neutral-800 rounded-xl text-sm font-mono focus:outline-none focus:border-indigo-500 transition-colors text-white"
              required
            />
          </div>

          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-xl transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset Auto
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-neutral-300 hover:bg-neutral-800 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl shadow-lg shadow-indigo-600/25 transition-all"
              >
                {saved ? <Check className="w-4 h-4" /> : null}
                Save & Reload
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
