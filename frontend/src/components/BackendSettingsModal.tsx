"use client";

import React, { useState, useEffect } from "react";
import { RotateCcw, X } from "lucide-react";
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40 overscroll-contain">
      <div className="relative w-full max-w-md bg-surface border border-line rounded-xl shadow-sm p-6 text-ink">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-xl tracking-tight">Backend settings</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="p-1.5 rounded-lg text-ink-soft hover:text-ink hover:bg-paper transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs text-ink-soft mb-5 leading-relaxed">
          Specify the central FastAPI backend URL. By default, it auto-detects your
          current host on port 8000. If you are using Cloudflare Tunnel, ngrok, or a
          remote IP, enter it below.
        </p>

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label htmlFor="backend-url" className="block text-xs font-medium text-ink-soft mb-1.5">
              Backend endpoint (HTTP/HTTPS)
            </label>
            <input
              id="backend-url"
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="http://192.168.1.50:8000 or https://…"
              autoComplete="off"
              spellCheck={false}
              className="w-full px-3.5 py-2.5 bg-paper border border-line rounded-lg text-sm font-mono text-ink placeholder:text-ink-soft/60 focus:border-clay"
              required
            />
          </div>

          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-ink-soft hover:text-ink transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              Reset auto
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-ink-soft hover:text-ink transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-clay hover:bg-clay-deep text-white text-xs font-semibold transition-colors"
              >
                Save &amp; reload
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
