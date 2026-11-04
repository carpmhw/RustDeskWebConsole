export {}

declare global {
  interface Window {
    RDWEB_CONFIG?: { basePath: string; defaultDisplayTimeZone: string }
  }
}
