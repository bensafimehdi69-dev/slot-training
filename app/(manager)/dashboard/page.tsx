"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { Plus, Users, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { getGroups, createGroup } from "./actions"
import { GroupCard } from "./_components/group-card"
import type { Group } from "@/lib/types/group"

export default function DashboardPage() {
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(true)
  const [createGroupOpen, setCreateGroupOpen] = useState(false)
  const [creatingGroup, setCreatingGroup] = useState(false)
  // Synchronous lock against double-submit (state propagates to disabled
  // one render late, so fast double-clicks would slip through).
  const creatingGroupRef = useRef(false)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [autoExpandDone, setAutoExpandDone] = useState(false)

  const loadGroups = useCallback(async () => {
    const result = await getGroups()
    if (result.error) {
      toast.error(result.error)
    } else if (result.data) {
      setGroups(result.data)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    loadGroups()
  }, [loadGroups])

  // Auto-expand the first group on initial load. Separated from loadGroups()
  // so we don't re-expand after every refresh (the previous implementation
  // used a deps-disabled useCallback to achieve the same thing; explicit is
  // clearer).
  useEffect(() => {
    if (autoExpandDone || groups.length === 0) return
    setExpandedGroups(new Set([groups[0].id]))
    setAutoExpandDone(true)
  }, [autoExpandDone, groups])

  const handleCreateGroup = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (creatingGroupRef.current) return
    creatingGroupRef.current = true
    setCreatingGroup(true)
    try {
      const formData = new FormData(e.currentTarget)
      const result = await createGroup(formData)
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success("Groupe créé avec succès.")
        setCreateGroupOpen(false)
        loadGroups()
      }
    } finally {
      creatingGroupRef.current = false
      setCreatingGroup(false)
    }
  }

  const toggleGroup = (groupId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(groupId)) next.delete(groupId)
      else next.add(groupId)
      return next
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">Gérez vos groupes, campagnes et plannings.</p>
        </div>
        <Dialog open={createGroupOpen} onOpenChange={setCreateGroupOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Nouveau groupe
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Créer un groupe</DialogTitle>
              <DialogDescription>
                Créez un groupe pour y inviter vos athlètes.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreateGroup}>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nom du groupe</Label>
                  <Input id="name" name="name" placeholder="Ex: U18 Garçons" required />
                </div>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={creatingGroup}>
                  {creatingGroup && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Créer
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {groups.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Users className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground text-center">
              Aucun groupe pour le moment. Créez votre premier groupe pour commencer.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <GroupCard
              key={group.id}
              group={group}
              isExpanded={expandedGroups.has(group.id)}
              onToggle={() => toggleGroup(group.id)}
              onRefresh={loadGroups}
            />
          ))}
        </div>
      )}
    </div>
  )
}
