import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { generateLabelPdf, type LabelData } from "../../../../lib/barcode-label"

/**
 * GET /admin/print-test/sample-label
 *
 * Generiert ein Sample-Label-PDF mit hardcoded Testdaten — für die
 * Print-Bridge-Diagnose-Seite (/app/print-test). Testet die gleiche
 * PDF-Pipeline wie der echte Inventory-Label-Endpoint, aber ohne
 * DB-Dependency. Nützlich wenn die Bridge isoliert getestet werden soll.
 */
export async function GET(
  _req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const sample: LabelData = {
    barcode: "VOD-TEST01",
    artistName: "Cabaret Voltaire",
    title: "Red Mecca",
    labelName: "Rough Trade",
    format: "LP",
    country: "UK",
    condition: "VG+",
    year: 1981,
    price: 42,
  }

  const doc = await generateLabelPdf(sample)
  res.setHeader("Content-Type", "application/pdf")
  res.setHeader("Content-Disposition", 'inline; filename="vod-sample-label.pdf"')
  doc.pipe(res)
}
