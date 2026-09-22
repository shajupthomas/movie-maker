import StudioView from "@/components/studio-view";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <StudioView projectId={id} />;
}
