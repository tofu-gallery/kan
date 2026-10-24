/**
 * Tofu (new file, 2026-10-24): AGPL-3.0 section 13 asks a changed copy that people use over a network to offer them
 * its source code. NEXT_PUBLIC_SOURCE_URL says where this copy's source is; Tofu's app gallery sets it to the commit
 * the copy was made from. Unset, the links open Tofu's fork of Kan.
 */
import Link from "next/link";
import { t } from "@lingui/core/macro";
import { env } from "next-runtime-env";

const FORK_SOURCE_URL = "https://github.com/tofu-gallery/kan";

export function getSourceUrl() {
  const sourceUrl = env("NEXT_PUBLIC_SOURCE_URL");
  return sourceUrl?.length ? sourceUrl : FORK_SOURCE_URL;
}

export function SourceCodeLink() {
  return (
    <p className="mt-8 text-xs text-light-900 dark:text-dark-900">
      <Link
        href={getSourceUrl()}
        target="_blank"
        rel="noreferrer"
        className="underline hover:text-light-1000 dark:hover:text-dark-1000"
      >
        {t`Source code`}
      </Link>
    </p>
  );
}
