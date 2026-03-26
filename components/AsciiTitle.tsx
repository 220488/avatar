"use client";

import { useEffect, useState } from "react";
import figlet from "figlet";

interface AsciiTitleProps {
  text: string;
  font?: figlet.Fonts;
  className?: string;
}

export default function AsciiTitle({
  text,
  font = "Small",
  className = "",
}: AsciiTitleProps) {
  const [art, setArt] = useState<string>("");

  useEffect(() => {
    figlet.text(text, { font }, (err, result) => {
      if (!err && result) setArt(result);
    });
  }, [text, font]);

  if (!art) return null;

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
