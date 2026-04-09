import { useState } from "react"

const DiscogsImportPage = () => {
  const [count, setCount] = useState(0)

  return (
    <div style={{ padding: 40 }}>
      <h1>Discogs Collection Import</h1>
      <p>Minimal test page — if you see this, the route works.</p>
      <p>Count: {count}</p>
      <button onClick={() => setCount(count + 1)}>Increment</button>
    </div>
  )
}

export default DiscogsImportPage
