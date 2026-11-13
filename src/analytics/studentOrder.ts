const studentIdCollator = new Intl.Collator('zh-CN', { numeric: true });

export function compareStudentIds(left: string, right: string): number {
  return studentIdCollator.compare(left, right) || left.localeCompare(right, 'zh-CN');
}
