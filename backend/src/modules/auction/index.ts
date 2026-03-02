import AuctionModuleService from "./service"
import { Module } from "@medusajs/framework/utils"

export const AUCTION_MODULE = "auction"

export default Module(AUCTION_MODULE, {
  service: AuctionModuleService,
})
