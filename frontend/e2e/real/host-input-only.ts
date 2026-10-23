import type {
  HostResult,
  InputOnlyClient,
  InputOnlyClientReport,
  InputOnlyClientCode,
  InputOnlyClassification,
} from './host-observation-schema.ts'

// 只有完整本機證據才維持completed；既有失敗不因稍後收尾或host結果升級。
export function inputOnlyClientCode(report: InputOnlyClientReport): InputOnlyClientCode {
  if (report.code !== 'input_only_completed') return report.code
  if (!report.resourcesClosed) return 'input_only_cleanup_failed'
  const { main, encoded, observation, timeline } = report
  if (
    !main.prefixSubmitted ||
    !main.prefixAccepted ||
    main.postTextInput ||
    main.clipboardObserved ||
    main.scopeInterrupted ||
    main.overflow ||
    !encoded.observed ||
    !encoded.textExact ||
    !encoded.textSingle ||
    !encoded.initialSelectComplete ||
    !encoded.sequenceComplete ||
    encoded.sequenceInvalid ||
    encoded.overflow ||
    encoded.unavailable
  )
    return 'input_only_input_failed'
  if (
    !observation.completed ||
    observation.budgetMs !== 5000 ||
    observation.elapsedMs === null ||
    observation.elapsedMs < 5000 ||
    observation.elapsedMs > 180000 ||
    timeline.unavailable ||
    timeline.overflow ||
    timeline.events.some(
      /* 收到剪貼簿操作便不再是安靜對照。 */ (event) =>
        ['pull_submit', 'clipboard_data', 'native_write'].includes(event.kind),
    )
  )
    return 'input_only_observation_unavailable'
  return 'input_only_completed'
}

// 只分類已驗證同輪資料；host變化列不代表瀏覽器5秒窗內的完整覆蓋。
export function classifyHostInputOnly(
  client: InputOnlyClient,
  host: HostResult,
): InputOnlyClassification {
  if (
    client.purpose !== 'input_only' ||
    inputOnlyClientCode(client) !== 'input_only_completed' ||
    host.code !== 'host_observed' ||
    host.unavailable ||
    host.overflow ||
    !host.resourcesClosed
  )
    return 'inconclusive'
  const rows = host.observations.filter(
    /* baseline／clipboard不能代替獨立editor取樣。 */ (row) =>
      row.kind === 'editor' &&
      row.code === 'host_observed' &&
      row.scopeVerified &&
      row.editorReadable &&
      row.editorStable,
  )
  if (rows.some(/* 曾有exact僅代表該次query相等。 */ (row) => row.editorExact))
    return 'stable_exact_observed'
  return rows.length ? 'stable_mismatch_observed' : 'inconclusive'
}
