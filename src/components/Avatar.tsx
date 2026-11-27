import { IconUser } from "./icons";

/** A user's picture, or their initial (or a person icon) on a tinted circle. */
export default function Avatar({ url, name, className = "size-9" }: { url?: string | null; name?: string | null; className?: string }) {
  const letter = name?.trim().charAt(0).toUpperCase();
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" className={`${className} shrink-0 rounded-full object-cover`} />
  ) : (
    <span aria-hidden className={`${className} flex shrink-0 items-center justify-center rounded-full bg-accent/15 font-semibold text-accent`}>
      {letter || <IconUser className="h-[55%] w-[55%]" />}
    </span>
  );
}
