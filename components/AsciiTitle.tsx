// Pre-rendered figlet ASCII art (Small + Mini fonts)
// Generated server-side to avoid browser font-loading issues.

export const TITLE_ART = `   ___     _       _     _  _                _           _
  / __|___| |_    /_\\   | \\| |_____ __ __   /_\\__ ____ _| |_ __ _ _ _
 | (_ / -_)  _|  / _ \\  | .\` / -_) V  V /  / _ \\ V / _\` |  _/ _\` | '_|
  \\___\\___|\__| /_/ \\_\\ |_|\\_\\___|\\_/\\_/  /_/ \\_\\_/\\__,_|\\__\\__,_|_|  `;

export const SUBTITLE_ART = `  o ._     /\\  (_  /   |   |     _. ._ _|_
  | | |   /--\\ __) \\_ _|_ _|_   (_| |   |_ `;

interface AsciiTitleProps {
  art: string;
  className?: string;
}

export default function AsciiTitle({ art, className = "" }: AsciiTitleProps) {
  return (
    <pre
      className={className}
      style={{
        fontFamily: '"Courier New", Courier, monospace',
        lineHeight: 1.2,
        whiteSpace: "pre",
        display: "inline-block",
      }}
    >
      {art}
    </pre>
  );
}
