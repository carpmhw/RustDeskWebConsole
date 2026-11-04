// 僅供公開校準bundle的Node tsc識別SFC；真正SFC由既有Vue plugin編譯。
declare module '*.vue' {
  const component: import('vue').DefineComponent
  export default component
}
