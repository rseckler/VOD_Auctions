"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { useAuth } from "@/components/AuthProvider"
import { getToken } from "@/lib/auth"
import { medusaAuthFetch } from "@/lib/api"

// "Edit" link on a post detail — shown only to the post's author. The post
// detail is cached/server-rendered, so authorship is checked client-side.
export function EditPostLink({
  postId,
  authorHandle,
}: {
  postId: string
  authorHandle: string
}) {
  const { isAuthenticated } = useAuth()
  const [isAuthor, setIsAuthor] = useState(false)

  useEffect(() => {
    if (!isAuthenticated) return
    const token = getToken()
    if (!token) return
    medusaAuthFetch<{ profile: { handle: string } }>(
      "/store/community/profile",
      token
    ).then((d) => {
      if (d?.profile?.handle === authorHandle) setIsAuthor(true)
    })
  }, [isAuthenticated, authorHandle])

  if (!isAuthor) return null
  return (
    <Link
      href={`/community/compose?edit=${encodeURIComponent(postId)}`}
      className="cm-save-btn"
      prefetch={false}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4Z" />
      </svg>
      Edit
    </Link>
  )
}
