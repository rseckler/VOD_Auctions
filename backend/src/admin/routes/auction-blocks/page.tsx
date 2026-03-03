import { defineRouteConfig } from "@medusajs/admin-sdk"
import { ChatBubbleLeftRight } from "@medusajs/icons"
import { Container, Heading, Table, Badge, Button, Text } from "@medusajs/ui"
import { useEffect, useState } from "react"

type AuctionBlock = {
  id: string
  title: string
  subtitle: string | null
  slug: string
  status: string
  block_type: string
  start_time: string
  end_time: string
  items?: { id: string }[]
  created_at: string
}

const STATUS_COLORS: Record<string, "green" | "orange" | "blue" | "grey" | "red" | "purple"> = {
  draft: "grey",
  scheduled: "blue",
  preview: "orange",
  active: "green",
  ended: "red",
  archived: "purple",
}

const AuctionBlocksPage = () => {
  const [blocks, setBlocks] = useState<AuctionBlock[]>([])
  const [loading, setLoading] = useState(true)

  const fetchBlocks = async () => {
    try {
      const res = await fetch("/admin/auction-blocks", { credentials: "include" })
      const data = await res.json()
      setBlocks(data.auction_blocks || [])
    } catch (err) {
      console.error("Failed to fetch blocks:", err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchBlocks()
  }, [])

  return (
    <Container>
      <div className="flex items-center justify-between mb-6">
        <div>
          <Heading level="h1">Auction Blocks</Heading>
          <Text className="text-ui-fg-subtle mt-1">
            Manage themed auction blocks
          </Text>
        </div>
        <a href="/app/auction-blocks/create">
          <Button>Create New Block</Button>
        </a>
      </div>

      {loading ? (
        <Text>Loading...</Text>
      ) : blocks.length === 0 ? (
        <Container className="text-center py-12">
          <Text className="text-ui-fg-subtle">
            No auction blocks created yet.
          </Text>
          <a href="/app/auction-blocks/create">
            <Button className="mt-4">Create First Block</Button>
          </a>
        </Container>
      ) : (
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Title</Table.HeaderCell>
              <Table.HeaderCell>Type</Table.HeaderCell>
              <Table.HeaderCell>Status</Table.HeaderCell>
              <Table.HeaderCell>Start</Table.HeaderCell>
              <Table.HeaderCell>End</Table.HeaderCell>
              <Table.HeaderCell>Items</Table.HeaderCell>
              <Table.HeaderCell></Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {blocks.map((block) => (
              <Table.Row key={block.id}>
                <Table.Cell>
                  <div>
                    <Text className="font-medium">{block.title}</Text>
                    {block.subtitle && (
                      <Text className="text-ui-fg-subtle text-sm">
                        {block.subtitle}
                      </Text>
                    )}
                  </div>
                </Table.Cell>
                <Table.Cell>
                  <Badge>{block.block_type}</Badge>
                </Table.Cell>
                <Table.Cell>
                  <Badge color={STATUS_COLORS[block.status] || "grey"}>
                    {block.status}
                  </Badge>
                </Table.Cell>
                <Table.Cell>
                  {new Date(block.start_time).toLocaleDateString("en-GB")}
                </Table.Cell>
                <Table.Cell>
                  {new Date(block.end_time).toLocaleDateString("en-GB")}
                </Table.Cell>
                <Table.Cell>{block.items?.length || 0}</Table.Cell>
                <Table.Cell>
                  <a href={`/app/auction-blocks/${block.id}`}>
                    <Button variant="secondary" size="small">
                      Edit
                    </Button>
                  </a>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      )}
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Auction Blocks",
  icon: ChatBubbleLeftRight,
})

export default AuctionBlocksPage
