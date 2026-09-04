import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { individualWorkUrl } from "../lib/drive";
import type { AudioWork } from "../types";

const qrCardTemplateUrl = `${import.meta.env.BASE_URL}qr-card-template.jpeg`;
const qrPosition = {
  x: 183,
  y: 535,
  size: 709,
};

function loadImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Não foi possível carregar a imagem."));
    image.src = source;
  });
}

async function createBrandedQrCode(qrCodeUrl: string) {
  const [qrCode, template] = await Promise.all([
    loadImage(qrCodeUrl),
    loadImage(qrCardTemplateUrl),
  ]);
  const canvas = document.createElement("canvas");
  canvas.width = template.naturalWidth;
  canvas.height = template.naturalHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Não foi possível montar o cartão do QR Code.");

  context.drawImage(template, 0, 0, canvas.width, canvas.height);

  // Apaga exclusivamente o QR presente no gabarito. Todo o restante da arte,
  // incluindo símbolo AD, fontes, logo e molduras, permanece idêntico ao original.
  context.fillStyle = "#ffffff";
  context.fillRect(
    qrPosition.x - 2,
    qrPosition.y - 2,
    qrPosition.size + 4,
    qrPosition.size + 4,
  );

  context.imageSmoothingEnabled = false;
  context.drawImage(
    qrCode,
    qrPosition.x,
    qrPosition.y,
    qrPosition.size,
    qrPosition.size,
  );
  context.imageSmoothingEnabled = true;

  return canvas.toDataURL("image/png");
}

export default function QrDialog({
  work,
  onClose,
}: {
  work: AudioWork;
  onClose: () => void;
}) {
  const [shareUrl] = useState(() => individualWorkUrl(work.id));
  const [qrCodeUrl, setQrCodeUrl] = useState("");
  const [brandedQrCodeUrl, setBrandedQrCodeUrl] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    void QRCode.toDataURL(shareUrl, {
      width: qrPosition.size,
      margin: 0,
      errorCorrectionLevel: "H",
      color: { dark: "#111111", light: "#ffffff" },
    }).then((value) => {
      if (active) setQrCodeUrl(value);
    }).catch(() => {
      if (active) setMessage("Não foi possível gerar o QR Code.");
    });
    return () => {
      active = false;
    };
  }, [shareUrl]);

  useEffect(() => {
    if (!qrCodeUrl) return;
    let active = true;
    void createBrandedQrCode(qrCodeUrl)
      .then((value) => {
        if (active) setBrandedQrCodeUrl(value);
      })
      .catch(() => {
        if (active) setMessage("O QR Code foi criado, mas o cartão não pôde ser montado.");
      });
    return () => {
      active = false;
    };
  }, [qrCodeUrl]);

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
          
        </p>

        <div className="qr-frame" aria-live="polite">
          {brandedQrCodeUrl ? (
            <img
              src={brandedQrCodeUrl}
              alt={`Cartão com QR Code para a audiodescrição ${work.title}`}
            />
          ) : (
            <span>Gerando cartão do QR Code…</span>
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
          {brandedQrCodeUrl ? (
            <a
              href={brandedQrCodeUrl}
              download={`audiodescricao-${safeTitle}.png`}
            >
              Baixar cartão
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
