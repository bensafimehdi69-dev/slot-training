"use client"

import { useRef, useState } from "react"
import { toast } from "sonner"
import { useTranslations } from "next-intl"
import {
  Users,
  Pencil,
  Trash2,
  Loader2,
  ChevronDown,
  ChevronUp,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { updateGroup, deleteGroup } from "../actions"
import { AthletesTab } from "./athletes-tab"
import { CampaignsTab } from "./campaigns-tab"
import type { Group } from "@/lib/types/group"

interface GroupCardProps {
  group: Group
  isExpanded: boolean
  onToggle: () => void
  onRefresh: () => void
}

export function GroupCard({ group, isExpanded, onToggle, onRefresh }: GroupCardProps) {
  const t = useTranslations("managerDashboard")
  const tc = useTranslations("common")
  const [editOpen, setEditOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  // Synchronous locks so a fast double-click can't fire the action twice
  // while React is still propagating the disabled state.
  const editingRef = useRef(false)
  const deletingRef = useRef(false)

  const handleEdit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (editingRef.current) return
    editingRef.current = true
    setEditing(true)
    try {
      const formData = new FormData(e.currentTarget)
      const result = await updateGroup(group.id, formData)
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success(t("groupUpdated"))
        setEditOpen(false)
        onRefresh()
      }
    } finally {
      editingRef.current = false
      setEditing(false)
    }
  }

  const handleDelete = async () => {
    if (deletingRef.current) return
    deletingRef.current = true
    setDeleting(true)
    try {
      const result = await deleteGroup(group.id)
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success(t("groupDeleted"))
        onRefresh()
      }
    } finally {
      deletingRef.current = false
      setDeleting(false)
    }
  }

  const panelId = `group-panel-${group.id}`

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          {/* Keyboard-accessible expand/collapse toggle. */}
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={isExpanded}
            aria-controls={panelId}
            className="flex flex-1 items-center gap-3 text-left"
          >
            <Users className="h-5 w-5 shrink-0 text-blue-600" />
            <div className="min-w-0">
              <CardTitle className="text-lg">{group.name}</CardTitle>
              <CardDescription>
                {t("createdOn", {
                  date: new Date(group.createdAt).toLocaleDateString(),
                })}
              </CardDescription>
            </div>
          </button>
          <div className="flex items-center gap-1">
            <Dialog open={editOpen} onOpenChange={setEditOpen}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="sm" aria-label="Modifier le groupe">
                  <Pencil className="h-4 w-4 text-muted-foreground" />
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t("editGroupTitle")}</DialogTitle>
                  <DialogDescription>{t("editGroupDescription")}</DialogDescription>
                </DialogHeader>
                <form onSubmit={handleEdit}>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor={`edit-name-${group.id}`}>{t("groupNameLabel")}</Label>
                      <Input
                        id={`edit-name-${group.id}`}
                        name="name"
                        defaultValue={group.name}
                        required
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button type="submit" disabled={editing}>
                      {editing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      {tc("save")}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={deleting}
                  aria-label="Supprimer le groupe"
                >
                  {deleting ? (
                    <Loader2 className="h-4 w-4 animate-spin text-red-500" />
                  ) : (
                    <Trash2 className="h-4 w-4 text-red-500" />
                  )}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    {t("deleteGroupTitle", { name: group.name })}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {t("deleteGroupDescription")}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete}>
                    {tc("delete")}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            {isExpanded ? (
              <ChevronUp className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
            ) : (
              <ChevronDown className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
            )}
          </div>
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent id={panelId}>
          <Tabs defaultValue="athletes" className="w-full">
            <TabsList>
              <TabsTrigger value="athletes">{t("tabAthletes")}</TabsTrigger>
              <TabsTrigger value="campaigns">{t("tabCampaigns")}</TabsTrigger>
            </TabsList>

            <TabsContent value="athletes" className="mt-4">
              <AthletesTab group={group} onRefresh={onRefresh} />
            </TabsContent>

            <TabsContent value="campaigns" className="mt-4">
              <CampaignsTab group={group} />
            </TabsContent>
          </Tabs>
        </CardContent>
      )}
    </Card>
  )
}
