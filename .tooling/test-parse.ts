import pdfParse from "npm:pdf-parse@1.1.1";
Deno.env.set("PARSE_PERMIT_NO_SERVE", "1");
const { parsePermitText } = await import("../supabase/functions/parse-permit/index.ts");

const path = Deno.args[0];
const bytes = await Deno.readFile(path);
const parsed = await pdfParse(bytes);
const result = parsePermitText(parsed.text || "");

console.log("permit_number:", result.permit_number);
console.log("parser_version:", result.parser_version);
console.log("\norigin_text:", result.origin_text);
console.log("origin_structured:", JSON.stringify(result.origin_structured));
console.log("\ndestination_text:", result.destination_text);
console.log("destination_structured:", JSON.stringify(result.destination_structured));
console.log("\nwarnings:", JSON.stringify(result.warnings));
console.log(`\nsteps: ${result.steps.length}`);
for (const s of result.steps) {
  console.log(
    `  leg=${s.leg_miles} odo=${s.permit_odometer_mi} | ${s.from_road ?? "?"} ${s.from_dir ?? ""} -> ${s.maneuver ?? "?"} -> ${s.to_road ?? ""} ${s.to_dir ?? ""}`,
  );
}
console.log(`\nsegments: ${result.segments.length}`);
for (const seg of result.segments) {
  console.log(`  [${seg.label}] ${seg.text}  (q0: ${seg.queries[0] ?? "-"})`);
}
