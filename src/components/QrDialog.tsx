import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { individualWorkUrl } from "../lib/drive";
import type { AudioWork } from "../types";

const logoUrl = `${import.meta.env.BASE_URL}verbalizado-horizontal.png`;

function loadImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Não foi possível carregar a imagem."));
    image.src = source;
  });
}

function drawCornerBrackets(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const radius = 28;
  const length = 105;
  context.save();
  context.strokeStyle = "#111111";
  context.lineWidth = 8;
  context.lineCap = "round";

  context.beginPath();
  context.moveTo(x, y + length);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.lineTo(x + length, y);

  context.moveTo(x + width - length, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + length);

  context.moveTo(x, y + height - length);
  context.lineTo(x, y + height - radius);
  context.quadraticCurveTo(x, y + height, x + radius, y + height);
  context.lineTo(x + length, y + height);

  context.moveTo(x + width - length, y + height);
  context.lineTo(x + width - radius, y + height);
  context.quadraticCurveTo(
    x + width,
    y + height,
    x + width,
    y + height - radius,
  );
  context.lineTo(x + width, y + height - length);
  context.stroke();
  context.restore();
}

async function createBrandedQrCode(qrCodeUrl: string) {
  const [qrCode, logo] = await Promise.all([
    loadImage(qrCodeUrl),
    loadImage(logoUrl),
  ]);
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1520;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Não foi possível montar o cartão do QR Code.");

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#111111";
  context.textAlign = "center";
  context.textBaseline = "alphabetic";

  context.font = "900 210px Arial, Helvetica, sans-serif";
  context.fillText("AD", 430, 245);

  context.save();
  context.strokeStyle = "#111111";
  context.lineWidth = 25;
  context.lineCap = "round";
  [62, 105, 148].forEach((radius) => {
    context.beginPath();
    context.arc(570, 174, radius, -0.82, 0.82);
    context.stroke();
  });
  context.restore();

  context.font = "500 62px Arial, Helvetica, sans-serif";
  context.fillText("AUDIODESCRIÇÃO", 540, 355);

  const logoWidth = 520;
  const logoHeight = Math.round((logo.height / logo.width) * logoWidth);
  const logoCanvas = document.createElement("canvas");
  logoCanvas.width = logoWidth;
  logoCanvas.height = logoHeight;
  const logoContext = logoCanvas.getContext("2d");
  if (!logoContext) throw new Error("Não foi possível preparar a logo.");
  logoContext.drawImage(logo, 0, 0, logoWidth, logoHeight);
  logoContext.globalCompositeOperation = "source-in";
  logoContext.fillStyle = "#111111";
  logoContext.fillRect(0, 0, logoWidth, logoHeight);
  context.drawImage(logoCanvas, (canvas.width - logoWidth) / 2, 390);

  drawCornerBrackets(context, 95, 505, 890, 825);
  context.imageSmoothingEnabled = false;
  context.drawImage(qrCode, 160, 540, 760, 760);
  context.imageSmoothingEnabled = true;

  context.font = "500 46px Arial, Helvetica, sans-serif";
  context.fillText("Escaneie o QR Code e ouça", 540, 1410);
  context.fillText("gratuitamente a audiodescrição da obra.", 540, 1472);

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
      width: 760,
      margin: 4,
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
          O cartão abre somente a audiodescrição desta obra e tenta iniciar a
          reprodução automaticamente.
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
