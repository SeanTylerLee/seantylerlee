import pdfParse from "npm:pdf-parse@1.1.1";

const path = Deno.args[0];
const bytes = await Deno.readFile(path);
const parsed = await pdfParse(bytes);
console.log("=== RAW pdf-parse text START ===");
console.log(parsed.text);
console.log("=== RAW pdf-parse text END ===");
