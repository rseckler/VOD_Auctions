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
          !function(){"use strict";window.RudderSnippetVersion="3.2.0";var e="rudderanalytics";window[e]||(window[e]=[]);
          var rudderanalytics=window[e];if(Array.isArray(rudderanalytics)){
          if(true===rudderanalytics.snippetExecuted&&window.console&&console.error){
          console.error("RudderStack JavaScript SDK snippet included more than once.")}else{rudderanalytics.snippetExecuted=true,
          window.rudderAnalyticsBuildType="legacy";var sdkBaseUrl="https://cdn.rudderlabs.com";var sdkVersion="v3";
          var sdkFileName="rsa.min.js";var scriptLoadingMode="async";
          var r=["setDefaultInstanceKey","load","ready","page","track","identify","alias","group","reset","setAnonymousId","startSession","endSession","consent","addCustomIntegration"];
          for(var n=0;n<r.length;n++){var t=r[n];rudderanalytics[t]=function(r){return function(){var n;
          Array.isArray(window[e])?rudderanalytics.push([r].concat(Array.prototype.slice.call(arguments))):null===(n=window[e][r])||void 0===n||n.apply(window[e],arguments)}}(t)}
          try{new Function('class Test{field=()=>{};test({prop=[]}={}){return prop?(prop?.property??[...prop]):import("");}}'),
          window.rudderAnalyticsBuildType="modern"}catch(i){}
          var d=document.head||document.getElementsByTagName("head")[0];
          var o=document.body||document.getElementsByTagName("body")[0];
          window.rudderAnalyticsAddScript=function(e,r,n){var t=document.createElement("script");t.src=e,
          t.setAttribute("data-loader","RS_JS_SDK"),r&&n&&t.setAttribute(r,n),
          "async"===scriptLoadingMode?t.async=true:"defer"===scriptLoadingMode&&(t.defer=true),
          d?d.insertBefore(t,d.firstChild):o.insertBefore(t,o.firstChild)};
          window.rudderAnalyticsMount=function(){
          window.rudderAnalyticsAddScript("".concat(sdkBaseUrl,"/").concat(sdkVersion,"/").concat(window.rudderAnalyticsBuildType,"/").concat(sdkFileName),"data-rsa-write-key","${writeKey}")};
          "undefined"==typeof Promise||"undefined"==typeof globalThis?
          window.rudderAnalyticsAddScript("https://polyfill-fastly.io/v3/polyfill.min.js?version=3.111.0&features=Symbol%2CPromise&callback=rudderAnalyticsMount"):
          window.rudderAnalyticsMount();
          var loadOptions={};rudderanalytics.load("${writeKey}","${dataPlaneUrl}",loadOptions)}}}();
        `
      }}
    />
  )
}
