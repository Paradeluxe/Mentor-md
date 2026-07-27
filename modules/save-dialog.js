/**
 * Pure save-dialog copy model for Mentor.
 * No DOM.
 */

export function buildSaveDialogModel(input = {}) {
  const fileName = input.fileName || 'document';
  const ann = Number(input.annotations) || 0;
  const refs = Number(input.references) || 0;
  const media = Number(input.media) || 0;

  switch (input.kind) {
    case 'external-modified':
      return {
        title: '文件已在外部修改',
        message: '继续保存会覆盖外部版本。建议先取消并重新打开或另存副本。',
        primaryLabel: '仍然覆盖',
        secondaryLabel: '另存副本',
        cancelLabel: '取消',
        severity: 'danger',
        details: [
          { label: '文件', value: fileName },
          { label: '风险', value: '覆盖磁盘上的外部修改' },
        ],
      };
    case 'protected':
      return {
        title: '此文档受保护',
        message: '为避免覆盖研究原稿，Mentor 已阻止直接写回。',
        primaryLabel: '另存副本',
        secondaryLabel: '',
        cancelLabel: '取消',
        severity: 'warning',
        details: [
          { label: '文件', value: fileName },
          { label: '建议', value: '另存为 .mentor 副本，不改原文件' },
        ],
      };
    case 'anchor-audit':
      return {
        title: '批注位置需要检查',
        message: `检测到 ${input.issueCount || 1} 个批注位置不一致，已停止保存以避免写坏文件。`,
        primaryLabel: '查看问题',
        secondaryLabel: '另存诊断副本',
        cancelLabel: '取消',
        severity: 'danger',
        details: [
          { label: '文件', value: fileName },
          { label: '问题数', value: String(input.issueCount || 1) },
        ],
      };
    case 'permission-denied':
      return {
        title: '没有写权限',
        message: '浏览器拒绝写回原文件。可另存 .mentor 副本，或重新打开文件并授权。',
        primaryLabel: '另存 .mentor',
        secondaryLabel: '',
        cancelLabel: '取消',
        severity: 'warning',
        details: [{ label: '文件', value: fileName }],
      };
    case 'no-handle':
    default:
      return {
        title: '保存文档',
        message: '当前浏览器不能直接写回原文件。建议保存为 .mentor，以保留正文、批注、图片和文献库。',
        primaryLabel: '保存 .mentor',
        secondaryLabel: '仅导出 Markdown',
        cancelLabel: '取消',
        severity: 'normal',
        details: [
          { label: '文件', value: mentorLikeName(fileName) },
          { label: '去向', value: '下载到本机' },
          { label: '包含', value: `正文 · 批注 ${ann} · 文献 ${refs} · 图片 ${media}` },
          { label: '不含', value: '不会写回原路径' },
        ],
      };
  }
}

function mentorLikeName(name) {
  const n = String(name || 'document');
  if (/\.mentor$/i.test(n)) return n;
  return n.replace(/\.(md|markdown)$/i, '') + '.mentor';
}

export function buildSaveResultCopy({ kind, fileName } = {}) {
  if (kind === 'write-current') {
    return { status: '已保存', detail: `已写回 ${fileName || ''}`.trim(), clearsDirty: true };
  }
  if (kind === 'save-copy') {
    return { status: '副本已下载', detail: '原文件未改变', clearsDirty: false };
  }
  if (kind === 'save-download-mentor') {
    return { status: '已保存', detail: `${fileName || '.mentor'} 已下载`, clearsDirty: true };
  }
  if (kind === 'export-md') {
    return { status: 'Markdown 已导出', detail: '原文件未改变', clearsDirty: false };
  }
  if (kind === 'export-docx') {
    return { status: 'DOCX 已导出', detail: '仅正文；批注与文献库未导出', clearsDirty: false };
  }
  return { status: '已完成', detail: '', clearsDirty: false };
}
