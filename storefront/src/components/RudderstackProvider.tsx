"use client"
import { useEffect } from "react"
import { usePathname } from "next/navigation"
import Script from "next/script"
import { rudderPage } from "@/lib/rudderstack"

export default function RudderstackProvider() {
  const writeKey = process.env.NEXT_PUBLIC_RUDDERSTACK_WRITE_KEY
  const dataPlaneUrl = process.env.NEXT_PUBLIC_RUDDERSTACK_DATA_PLANE_URL
  const pathname = usePathname()

  useEffect(() => {
    rudderPage()
  }, [pathname])

  if (!writeKey || !dataPlaneUrl) return null

  return (
    <Script
      id="rudderstack-init"
      strategy="afterInteractive"
      dangerouslySetInnerHTML={{
        __html: `
          rudderanalytics=window.rudderanalytics=[];
          var methods=["load","page","track","identify","alias","group","ready","reset","getAnonymousId","setAnonymousId"];
          for(var i=0;i<methods.length;i++){var method=methods[i];rudderanalytics[method]=function(a){return function(){rudderanalytics.push([a].concat(Array.prototype.slice.call(arguments)))}}(method)}
          rudderanalytics.load("${writeKey}", "${dataPlaneUrl}");
          rudderanalytics.page();
        `
      }}
    />
  )
}
