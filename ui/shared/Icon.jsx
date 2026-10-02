const paths = {
    translate: "m4 5 12 0M10 3v2M7 5c0 5 3 8 7 10M13 5c0 5-3 8-8 11M14 20l4-10 4 10M15.5 17h5",
    services: "M5 4h14v6H5zM5 14h14v6H5zM8 7h.01M8 17h.01M15 7h1M15 17h1",
    subtitles: "M3 5h18v14H3zM6 13h5M14 13h4M6 16h3M12 16h6",
    webpage: "M3 4h18v16H3zM3 9h18M7 6.5h.01M10 6.5h.01M7 13h10M7 16h6",
    settings: "M4 7h9M17 7h3M4 17h3M11 17h9M13 4v6M7 14v6",
    globe: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M3 12h18M12 3c-5 5-5 13 0 18 5-5 5-13 0-18",
    arrow: "M5 12h14m-5-5 5 5-5 5",
    chevron: "m8 10 4 4 4-4",
    plus: "M12 5v14M5 12h14",
    close: "m6 6 12 12M18 6 6 18",
    // Appearance: follow the system, pinned light, pinned dark.
    "theme-system": "M3 5h18v11H3zM8 20h8M12 16v4",
    "theme-light": "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
    "theme-dark": "M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5",
};

export function Icon({name, className = ""}) {
    return (
        <svg
            className={`ui-icon ${className}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.65"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
        >
            <path d={paths[name] || paths.translate}/>
        </svg>
    );
}
