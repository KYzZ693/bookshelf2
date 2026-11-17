import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { unwrap } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import type { Profile } from '@/types/db'
import { qk } from './keys'
import { removeOldAvatar, uploadAvatar } from './storage'

export const USERNAME_RE = /^[A-Za-z0-9_]{3,24}$/

export async function isUsernameAvailable(username: string): Promise<boolean> {
  return Boolean(unwrap(await supabase.rpc('is_username_available', { p_username: username })))
}

export type ProfileUpdate = Partial<
  Pick<Profile, 'username' | 'display_name' | 'bio' | 'avatar_url' | 'accent_color' | 'banner_pattern'>
>

export function useUpdateProfile() {
  const qc = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: async (patch: ProfileUpdate) => {
      if (!user) throw new Error('Not signed in')
      const row = unwrap(await supabase.from('profiles').update(patch).eq('id', user.id).select('*').single())
      return row as Profile
    },
    onSuccess: (row) => {
      qc.setQueryData(qk.profile(user?.id), row)
    },
  })
}

export function useAvatarUpload() {
  const qc = useQueryClient()
  const { user, profile } = useAuth()
  return useMutation({
    mutationFn: async (file: File) => {
      if (!user) throw new Error('Not signed in')
      const url = await uploadAvatar(file, user.id)
      const row = unwrap(
        await supabase.from('profiles').update({ avatar_url: url }).eq('id', user.id).select('*').single(),
      ) as Profile
      // Clean up the previous file only after the profile points at the new one.
      removeOldAvatar(profile?.avatar_url, user.id).catch(() => undefined)
      return row
    },
    onSuccess: (row) => qc.setQueryData(qk.profile(user?.id), row),
  })
}
