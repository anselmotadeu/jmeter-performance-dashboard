export default function FormMessage({
  type,
  children,
}: {
  type: "error" | "success" | "info";
  children: React.ReactNode;
}) {
  const styles = {
    error: "border-red-200 bg-red-50 text-red-700",
    success: "border-emerald-200 bg-emerald-50 text-emerald-700",
    info: "border-indigo-200 bg-indigo-50 text-indigo-700",
  };
  return (
    <div
      role={type === "error" ? "alert" : "status"}
      className={
        "rounded-xl border px-4 py-3 text-sm leading-6 " + styles[type]
      }
    >
      {children}
    </div>
  );
}
