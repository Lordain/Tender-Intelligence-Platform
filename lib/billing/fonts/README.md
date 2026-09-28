Fonts embedded in the international-wire proforma invoice and service
agreement (lib/billing/wire-documents.ts), which print Chinese and English.

NotoSansSC-Regular-GB2312.ttf, NotoSansSC-Bold-GB2312.ttf

- Noto Sans SC 400 and 700, from the @expo-google-fonts/noto-sans-sc 0.4.3
  npm package (the Google Fonts build).
- Licensed under the SIL Open Font License 1.1 (OFL.txt). The reserved font
  name is "Source"; these subsets keep the name "Noto Sans SC".
- Subset on 2026-09-28 with fontTools pyftsubset to 8,055 characters:
  - GB2312 (6,763 hanzi plus its symbols);
  - ASCII and Latin-1, which cover accented Spanish and Portuguese;
  - General Punctuation, arrows and currency signs;
  - CJK Symbols and Punctuation, Halfwidth and Fullwidth Forms.

  Options: `--layout-features='*' --no-hinting --desubroutinize`.
- A name outside this set is refused with a message rather than printed as
  empty boxes (see unprintableCharacters).

Each PDF embeds only the glyphs it uses, so a document stays small; these
files are read by the server route only (next.config.ts traces them in).
