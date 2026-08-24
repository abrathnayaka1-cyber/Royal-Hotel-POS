declare module 'pdf-parse/lib/pdf-parse.js' {
  interface PdfParseResult {
    text: string;
    numpages: number;
    info?: unknown;
  }
  const pdfParse: (data: Buffer, options?: unknown) => Promise<PdfParseResult>;
  export default pdfParse;
}
