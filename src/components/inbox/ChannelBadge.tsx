import { Globe } from "lucide-react";

const PNG_CHANNELS: Record<string, string> = {
  whatsapp: "/channels/whatsapp.png",
  instagram: "/channels/instagram.png",
  messenger: "/channels/messenger.png",
};

/** Logo de marca del canal (PNG oficial para WA/IG/Messenger; SVG para el resto). */
export function ChannelIcon({ channel, className }: { channel: string; className?: string }) {
  const png = PNG_CHANNELS[channel];
  if (png) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={png} alt={channel} className={className} style={{ objectFit: "contain" }} />;
  }
  switch (channel) {
    case "telegram":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="#229ED9" aria-label="Telegram">
          <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
        </svg>
      );
    default: // webchat
      return <Globe className={className} style={{ color: "#6E42FF" }} />;
  }
}

/** Insignia circular blanca con el logo del canal. */
export function ChannelBadge({ channel, size = 16 }: { channel: string; size?: number }) {
  return (
    <span
      className="grid place-items-center rounded-full bg-tarjeta ring-1 ring-black/5"
      style={{ width: size, height: size }}
    >
      <ChannelIcon channel={channel} className="h-[72%] w-[72%]" />
    </span>
  );
}
