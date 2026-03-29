import { defineRouteConfig } from "@medusajs/admin-sdk"
import { useEffect, useState } from "react"

export const config = defineRouteConfig({
  label: "Customers",
})

function CustomersPage() {
  const [customers, setCustomers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch("/admin/customers/list?limit=50&offset=0&sort=created_at&order=desc", {
      credentials: "include",
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((d) => {
        setCustomers(d.customers || [])
        setLoading(false)
      })
      .catch((e) => {
        setError(String(e))
        setLoading(false)
      })
  }, [])

  return (
    <div style={{ padding: "32px", fontFamily: "sans-serif" }}>
      <h1 style={{ fontSize: "24px", marginBottom: "16px" }}>Customers</h1>
      {loading && <p>Loading...</p>}
      {error && <p style={{ color: "red" }}>Error: {error}</p>}
      {!loading && !error && (
        <p>{customers.length} customers loaded</p>
      )}
    </div>
  )
}

export default CustomersPage
