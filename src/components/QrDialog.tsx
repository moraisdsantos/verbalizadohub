import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { individualWorkUrl } from "../lib/drive";
import type { AudioWork } from "../types";

export default function QrDialog({
  work,
  onClose,
}: {
  work: AudioWork;
  onClose: () => void;
}) {
  const [shareUrl] = useState(() => individualWorkUrl(work.id));
  const [qrCodeUrl, setQrCodeUrl] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    void QRCode.toDataURL(shareUrl, {
      width: 300,
      margin: 2,
      errorCorrectionLevel: "M",
      color: { dark: "#151515", light: "#ffffff" },
    }).then((value) => {
      if (active) setQrCodeUrl(value);
    });
    return () => {
      active = false;
    };
  }, [shareUrl]);

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setMessage("Link copiado.");
    } catch {
      setMessage("Selecione e copie o link exibido abaixo.");
    }
  }

  const safeTitle = work.title.replace(/[^a-zA-Z0-9_-]+/g, "-");

  return (
    <div className="modal-backdrop" role="presentation">
      <section
        className="share-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-title"
      >
        <button
          className="close-dialog"
          type="button"
          onClick={onClose}
          aria-label="Fechar compartilhamento"
        >
          ×
        </button>
        <p className="section-eyebrow">Compartilhar obra</p>
        <h2 id="share-title">{work.title}</h2>
        <p className="dialog-description">
          O QR Code abre somente o player desta audiodescrição. O catálogo e a
          área administrativa não são exibidos.
        </p>

        <div className="qr-frame" aria-live="polite">
          {qrCodeUrl ? (
            <img src={qrCodeUrl} alt={`QR Code para ${work.title}`} />
          ) : (
            <span>Gerando QR Code…</span>
          )}
        </div>

        <label className="share-url-label" htmlFor="share-url">
          Link individual da obra
        </label>
        <input id="share-url" type="text" readOnly value={shareUrl} />

        <div className="dialog-actions">
          <button type="button" onClick={copyLink}>
            Copiar link
          </button>
          {qrCodeUrl ? (
            <a href={qrCodeUrl} download={`qrcode-${safeTitle}.png`}>
              Baixar QR Code
            </a>
          ) : null}
        </div>
        <p className="copy-message" role="status" aria-live="polite">
          {message}
        </p>
      </section>
    </div>
  );
}
