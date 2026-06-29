import type { Metadata, Viewport } from 'next'
import { BRAND_NAME, BRAND_TAGLINE, BRAND_FONT_URL, BRAND_TYPEFACE, BRAND_COLORS } from '@/lib/branding'
import './globals.css'

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  minimumScale: 1,
  maximumScale: 5,
  userScalable: true,
}

export const metadata: Metadata = {
  title: BRAND_NAME,
  description: BRAND_TAGLINE,
  openGraph: {
    title: BRAND_NAME,
    description: BRAND_TAGLINE,
    siteName: BRAND_NAME,
    type: 'website',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <link href={BRAND_FONT_URL} rel="stylesheet" />
        <meta name="theme-color" content={BRAND_COLORS.primary} />
        <link rel="icon" href="/logo-placeholder.svg" />
        <script dangerouslySetInnerHTML={{ __html: `
(function(apiKey){
    (function(p,e,n,d,o){var v,w,x,y,z;o=p[d]=p[d]||{};o._q=o._q||[];
    v=['initialize','identify','updateOptions','pageLoad','track','trackAgent'];for(w=0,x=v.length;w<x;++w)(function(m){
    o[m]=o[m]||function(){o._q[m===v[0]?'unshift':'push']([m].concat([].slice.call(arguments,0)));};})(v[w]);
    y=e.createElement(n);y.async=!0;y.src='https://cdn.pendo.io/agent/static/'+apiKey+'/pendo.js';
    z=e.getElementsByTagName(n)[0];z.parentNode.insertBefore(y,z);})(window,document,'script','pendo');
})('35c4afd1-c509-44a2-ac43-386f2047c02c');
`}} />
      </head>
      <body
        style={{
          fontFamily: `'${BRAND_TYPEFACE}', sans-serif`,
          color: '#1a1a1a',
          margin: 0,
          padding: 0,
          minHeight: '100vh',
          overflowX: 'hidden',
          maxWidth: '100vw',
        }}
      >
        {children}
      </body>
    </html>
  )
}
