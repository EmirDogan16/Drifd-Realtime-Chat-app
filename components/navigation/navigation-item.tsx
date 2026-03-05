import Link from 'next/link';

interface NavigationItemProps {
  id: string;
  name: string;
  imageUrl: string | null;
  isActive: boolean;
}

export function NavigationItem({ id, name, imageUrl, isActive }: NavigationItemProps) {
  return (
    <Link href={`/servers/${id}`} className="relative mb-2 flex w-full items-center justify-center group">
      <div
        className={`absolute left-0 w-1 rounded-r-full bg-white transition-all duration-200 ${
          isActive ? 'h-12 opacity-100' : 'h-2 opacity-0 group-hover:h-5 group-hover:opacity-100'
        }`}
      />
      <div
        className={`flex h-12 w-12 items-center justify-center overflow-hidden transition-all duration-200 ${
          isActive
            ? 'rounded-2xl bg-drifd-primary text-black'
            : 'rounded-[24px] bg-drifd-secondary text-white group-hover:rounded-2xl group-hover:bg-drifd-primary group-hover:text-black'
        }`}
      >
        {imageUrl ? (
          <img alt={name} className="h-full w-full object-cover" src={imageUrl} />
        ) : (
          <span className="text-xs font-bold">{name.slice(0, 2).toUpperCase()}</span>
        )}
      </div>
    </Link>
  );
}
