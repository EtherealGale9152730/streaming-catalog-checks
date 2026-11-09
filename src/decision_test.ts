import { deliverableRecords, type CatalogRecord } from "./catalog_check.ts";

const records: CatalogRecord[] = [
  { title: "Aurora Basic", amount: "$8.99", sourceUrl: "https://example.com/aurora-basic" },
  { title: "Aurora Plus", sourceUrl: "https://example.com/aurora-plus" }
];
const selected = deliverableRecords(records);
if (selected.length !== 1 || selected[0]?.title !== "Aurora Basic") {
  throw new Error(`expected one complete catalog record, received ${selected.length}`);
}
console.log("decision test passed: one complete record is delivered");
