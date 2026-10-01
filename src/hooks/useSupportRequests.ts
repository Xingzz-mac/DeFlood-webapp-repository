import { useCallback, useEffect, useState } from "react"
import type { PrototypeRole } from '../services/prototypeSession'
import type { CommunityData } from '../context/CommunityContext'
import {
  loadSupportRequests,
  submitSupportRequest,
  subscribeSupportRequests,
  transitionSupportRequest,
  archiveSupportRequest,
  cancelSupportRequest,
  type SupportRequestCreationInput,
  type SupportRequestStatus,
} from "../services/supportNetwork"

export function useSupportRequests() {
  const [requests, setRequests] = useState(loadSupportRequests)
  const refresh = useCallback(() => setRequests(loadSupportRequests()), [])

  useEffect(() => subscribeSupportRequests(refresh), [refresh])

  const submit = useCallback(
    (input: SupportRequestCreationInput) => {
      const request = submitSupportRequest(input)
      refresh()
      return request
    },
    [refresh],
  )

  const transition = useCallback(
    (id: string, status: SupportRequestStatus) => {
      const request = transitionSupportRequest(id, status)
      refresh()
      return request
    },
    [refresh],
  )

  const archive = useCallback((id: string, role: PrototypeRole) => {
    const request = archiveSupportRequest(id, role)
    refresh()
    return request
  }, [refresh])

  const cancel = useCallback((id: string, role: PrototypeRole, community: Pick<CommunityData, 'name' | 'township' | 'region'>) => {
    const request = cancelSupportRequest(id, role, community)
    refresh()
    return request
  }, [refresh])

  return { requests, submit, transition, archive, cancel, refresh }
}
