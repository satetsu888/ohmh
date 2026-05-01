/** Format an ISO string as an English relative time ("just now" / "Nm ago" / "Nh ago" / "Nd ago"). */
export const formatRelativeTime = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 0) {return `${diffDays}d ago`;}
  if (diffHours > 0) {return `${diffHours}h ago`;}
  if (diffMins > 0) {return `${diffMins}m ago`;}
  return "just now";
};
