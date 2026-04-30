/** 渡された ISO 文字列を「数秒前 / N分前 / N時間前 / N日前」表記に整形 */
export const formatRelativeTime = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 0) {return `${diffDays}日前`;}
  if (diffHours > 0) {return `${diffHours}時間前`;}
  if (diffMins > 0) {return `${diffMins}分前`;}
  return "数秒前";
};
