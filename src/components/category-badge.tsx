"use client";

type CategoryBadgeProps = {
  category?: string | null;
  className?: string;
};

type CategoryStyle = { icon: string; className: string };

const categoryStyle = (category?: string | null): CategoryStyle => {
  const value = (category || "").toLocaleLowerCase("vi");
  if (/(phở|pho|bún|bun|miến|mien|mỳ|my|bánh đa)/.test(value))
    return { icon: "🍜", className: "bg-[#a35e2d]/14 text-[#7f421e] dark:text-[#f1c496]" };
  if (/(lẩu|lau|nướng|nuong|hải sản|hai san|ốc)/.test(value))
    return { icon: "🍲", className: "bg-[#e5a36a]/28 text-[#70421f] dark:text-[#f6d3aa]" };
  if (/(cà phê|ca phe|cafe|trà|tra|đồ uống|do uong)/.test(value))
    return { icon: "☕", className: "bg-[#402c1e]/10 text-[#402c1e] dark:text-[#f7eadc]" };
  if (/(nhậu|nhau|bia|rượu|ruou)/.test(value))
    return { icon: "🍻", className: "bg-amber-500/15 text-amber-900 dark:text-amber-200" };
  return { icon: "🥢", className: "bg-[#b9784f]/14 text-[#754321] dark:text-[#eec29d]" };
};

export function categoryIcon(category?: string | null) {
  return categoryStyle(category).icon;
}

export function CategoryBadge({ category, className = "" }: CategoryBadgeProps) {
  if (!category) return null;
  const style = categoryStyle(category);
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${style.className} ${className}`}
    >
      <span aria-hidden="true">{style.icon}</span>
      {category}
    </span>
  );
}
