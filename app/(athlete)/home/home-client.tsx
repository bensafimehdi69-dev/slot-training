"use client"

import { useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { useTranslations } from "next-intl"
import {
  Timer,
  Loader2,
  Save,
  Mail,
  CalendarDays,
  CheckCircle2,
  ArrowRight,
  User,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AddressAutocompleteMap } from "@/components/custom/address-autocomplete-map"
import { AthleteAvailabilityGrid } from "@/components/custom/athlete-availability-grid"
import { LogoutButton } from "@/components/custom/logout-button"
import { NotificationsToggle } from "@/components/custom/notifications-toggle"
import { LanguagePicker } from "@/components/custom/language-picker"
import { saveAthleteProfile, setAthleteAvatar } from "@/lib/actions/profile"
import { AvatarUpload } from "@/components/custom/avatar-upload"
import type { AddressWithCoords } from "@/lib/types/address"
import type { ConstraintsGrid } from "@/lib/types/profile"
import type { AthleteCampaignSummary } from "./actions"

interface HomeClientProps {
  email: string
  firstName?: string
  avatarUrl?: string | null
  profile: {
    homeAddress: AddressWithCoords | null
    schoolAddress: AddressWithCoords | null
    clubAddress: AddressWithCoords | null
    constraintsGrid: ConstraintsGrid
  }
  campaigns: AthleteCampaignSummary[]
}

export function HomeClient({ email, firstName, avatarUrl, profile, campaigns }: HomeClientProps) {
  const [currentAvatarUrl, setCurrentAvatarUrl] = useState<string | null>(
    avatarUrl ?? null,
  )
  const t = useTranslations("athleteHome")
  const tav = useTranslations("avatar")
  const [homeAddress, setHomeAddress] = useState(profile.homeAddress)
  const [schoolAddress, setSchoolAddress] = useState(profile.schoolAddress)
  const [clubAddress, setClubAddress] = useState(profile.clubAddress)
  const [constraintsGrid, setConstraintsGrid] = useState<ConstraintsGrid>(
    profile.constraintsGrid
  )
  const [saving, setSaving] = useState(false)
  // Tab state lifts up so the sticky "save" bar is only rendered on the
  // profile tab (it would float meaninglessly over the campaigns list).
  const [tab, setTab] = useState<"campaigns" | "profile">("campaigns")

  async function handleSave() {
    if (!homeAddress) {
      toast.error(t("homeAddressRequired"))
      return
    }
    if (!schoolAddress) {
      toast.error(t("schoolAddressRequired"))
      return
    }
    setSaving(true)
    const result = await saveAthleteProfile({
      homeAddress,
      schoolAddress,
      clubAddress,
      constraintsGrid,
    })
    setSaving(false)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success(t("profileSaved"))
    }
  }

  return (
    <div className="min-h-screen">
      <header className="glass glass-sticky sticky top-0 z-40">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-2 font-bold text-xl">
            <Timer className="h-6 w-6 text-blue-600" />
            Slot Training
          </div>
          <div className="flex min-w-0 items-center gap-2 sm:gap-4">
            <span className="hidden max-w-[160px] truncate text-sm text-muted-foreground sm:inline sm:max-w-none">
              {email}
            </span>
            <LanguagePicker />
            <LogoutButton />
          </div>
        </div>
      </header>

      <main className="container mx-auto max-w-3xl space-y-6 px-4 py-8">
        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as "campaigns" | "profile")}
        >
          <TabsList className="w-full sm:w-auto">
            <TabsTrigger value="campaigns" className="flex-1 sm:flex-none">
              <CalendarDays className="mr-2 h-4 w-4" />
              {t("myCampaigns")}
            </TabsTrigger>
            <TabsTrigger value="profile" className="flex-1 sm:flex-none">
              <User className="mr-2 h-4 w-4" />
              {t("myProfile")}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="campaigns" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CalendarDays className="h-5 w-5 text-blue-600" />
                  {t("myCampaigns")}
                </CardTitle>
                <CardDescription>{t("campaignsDescription")}</CardDescription>
              </CardHeader>
              <CardContent>
                {campaigns.length === 0 ? (
                  <div className="rounded-md border border-dashed p-6 text-center">
                    <Mail className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">{t("noCampaigns")}</p>
                  </div>
                ) : (
                  <ul className="space-y-3">
                    {campaigns.map((c) => (
                      <CampaignRow key={c.id} campaign={c} />
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="profile" className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <AvatarUpload
                  src={currentAvatarUrl}
                  name={firstName ?? email}
                  size={64}
                  ariaLabel={tav("changeMyPhoto")}
                  onUpload={(formData) => setAthleteAvatar(formData)}
                  onUploaded={(url) => setCurrentAvatarUrl(url)}
                />
                <div>
                  <h1 className="text-2xl font-bold">{t("profileTitle")}</h1>
                  <p className="text-muted-foreground">{t("profileSubtitle")}</p>
                </div>
              </div>
              <NotificationsToggle />
            </div>

            <Card>
              <CardHeader>
                <CardTitle>{t("myAddresses")}</CardTitle>
                <CardDescription>{t("addressesDescription")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <AddressAutocompleteMap
                  label={t("homeAddress")}
                  value={homeAddress}
                  onChange={setHomeAddress}
                  required
                />
                <AddressAutocompleteMap
                  label={t("schoolAddress")}
                  value={schoolAddress}
                  onChange={setSchoolAddress}
                />
                <AddressAutocompleteMap
                  label={t("clubAddress")}
                  value={clubAddress}
                  onChange={setClubAddress}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t("weeklyAvailability")}</CardTitle>
                <CardDescription>{t("weeklyAvailabilityDescription")}</CardDescription>
              </CardHeader>
              <CardContent>
                <AthleteAvailabilityGrid
                  value={constraintsGrid}
                  onChange={setConstraintsGrid}
                />
              </CardContent>
            </Card>

            <div className="sticky bottom-4 flex justify-end">
              <Button size="lg" onClick={handleSave} disabled={saving}>
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {t("saveProfile")}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}

function CampaignRow({ campaign }: { campaign: AthleteCampaignSummary }) {
  const t = useTranslations("athleteHome")
  const isValidated = campaign.planningStatus === "validated"
  const isClosed = campaign.status === "closed"
  const ctaLabel = isValidated
    ? t("viewPlanning")
    : campaign.hasResponded
      ? t("editResponse")
      : isClosed
        ? t("viewOnly")
        : t("respond")

  return (
    <li>
      <Link
        href={`/campaign/${campaign.id}`}
        className="flex flex-col gap-2 rounded-md border p-3 transition-colors hover:bg-muted/40 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">
              {campaign.startDate} → {campaign.endDate}
            </span>
            <CampaignStatusBadge campaign={campaign} />
          </div>
          {campaign.trainingLocation && (
            <p className="truncate text-xs text-muted-foreground">
              {campaign.trainingLocation}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            {campaign.groupName}
            {campaign.hasResponded && campaign.respondedAt && (
              <span className="ml-2 inline-flex items-center gap-1 text-emerald-600">
                <CheckCircle2 className="h-3 w-3" />
                {t("respondedOn", { date: formatDate(campaign.respondedAt) })}
              </span>
            )}
          </p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-blue-600">
          {ctaLabel}
          <ArrowRight className="h-4 w-4" />
        </span>
      </Link>
    </li>
  )
}

function CampaignStatusBadge({ campaign }: { campaign: AthleteCampaignSummary }) {
  const t = useTranslations("athleteHome")
  if (campaign.planningStatus === "validated") {
    return <Badge className="bg-green-600 text-white">{t("statusValidated")}</Badge>
  }
  if (campaign.status === "closed") {
    return <Badge variant="secondary">{t("statusFinalized")}</Badge>
  }
  if (campaign.hasResponded) {
    return <Badge className="bg-blue-600 text-white">{t("statusResponded")}</Badge>
  }
  return (
    <Badge variant="outline" className="border-orange-300 bg-orange-50 text-orange-700">
      {t("statusToFill")}
    </Badge>
  )
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
    })
  } catch {
    return iso
  }
}
