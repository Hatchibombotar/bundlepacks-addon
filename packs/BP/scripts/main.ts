import { Container, Dimension, EnchantmentType, Entity, EntityComponentTypes, EntityEquippableComponent, EntityInventoryComponent, EntityTameMountComponent, EntityUnderwaterMovementComponent, EntityVariantComponent, EquipmentSlot, ItemDurabilityComponent, ItemDyeableComponent, ItemEnchantableComponent, ItemStack, Player, RGB, system, world } from "@minecraft/server"
import { disallowed_items } from "./config"
import { Vector3Utils as Vector, VECTOR3_UP } from '@minecraft/math'

interface ComponentRepresentation { typeId: accepted_item_components }

interface EnchantableComponentRepresentation extends ComponentRepresentation {
    typeId: "minecraft:enchantable",
    enchantments: {
        type: string,
        level: number
    }[]
}

interface DurabilityComponentRepresentation extends ComponentRepresentation {
    typeId: "minecraft:durability",
    damage?: number
}

interface DyeableComponentRepresentation extends ComponentRepresentation {
    typeId: "minecraft:dyeable",
    color?: RGB,
}

type ItemRepresentation = {
    typeId: string
    nameTag?: string
    amount: number
    components: ComponentRepresentation[]
} | null

const accepted_item_components = [
    "minecraft:enchantable",
    "minecraft:durability",
    "minecraft:dyeable",
] as const

type accepted_item_components = typeof accepted_item_components[number]

// bundlepacks that are currently being tracked
const containers: Record<string, TrackedBundlePackInfo> = {}

type TrackedBundlePackInfo = {
    entity: Entity
    in_use: boolean // if the item is being held, this is set to true - entity will get moved otherwise
    last_used_by_player: Player // the last player to use the bundlepack - used in case items need to be returned
}

let unhandledComponents = {}

let last_id = 0
let dimensions: Dimension[] = []

function init() {
    system.run(() => {
        last_id = world.getDynamicProperty("hatchi:last_bundlepack_id") as number ?? 0

        dimensions = ["overworld", "nether", "the_end"].map(x => world.getDimension(x))

        for (const dimension of dimensions) {
            const bundlepacks = dimension.getEntities(
                {
                    type: "hatchi:bundlepack_container",
                }
            )
            for (const bundlepack of bundlepacks) {
                bundlepack.remove()
            }
        }
    })
}


function tick() {
    // stores the entity ids of all tracked containers
    const validEntityIds: string[] = []

    for (const container of Object.values(containers)) {
        container.in_use = false

        const entity = container.entity
        validEntityIds.push(entity.id)
    }

    for (const player of world.getAllPlayers()) {
        let inventory = (player.getComponent(EntityComponentTypes.Inventory) as EntityInventoryComponent)?.container
        if (inventory == undefined) {
            console.error("inventory container undefined on player")
            continue
        }

        const held_item = inventory.getItem(player.selectedSlotIndex)
        if (!held_item?.hasTag("hatchi:bundlepack")) {
            continue
        }

        let bundlepack_id = held_item.getDynamicProperty("hatchi:bundlepack_id") as number
        if (bundlepack_id == undefined) {
            last_id += 1
            bundlepack_id = last_id

            world.setDynamicProperty("hatchi:last_bundlepack_id", bundlepack_id)
            held_item.setDynamicProperty("hatchi:bundlepack_id", bundlepack_id)
            inventory.setItem(player.selectedSlotIndex, held_item)
        }


        held_item.setLore([
            "Bundlepack " + String(bundlepack_id),
            "Right Click to Open"
        ])

        let bundlepack_entity: Entity;

        // if container is not being tracked, spawn an entity and start to track it
        // else, if the entity is undefined
        if (containers[bundlepack_id] == undefined || containers[bundlepack_id].entity == undefined || !containers[bundlepack_id].entity.isValid) {
            bundlepack_entity = player.dimension.spawnEntity(
                "hatchi:bundlepack_container",
                Vector.add(player.location, Vector.scale(VECTOR3_UP, 3)),
            )

            bundlepack_entity.nameTag = "custom.hatchi.bundlepack.inventory_name"

            containers[bundlepack_id] = {
                entity: bundlepack_entity,
                in_use: false,
                last_used_by_player: player
            }

            const backpack_data_str = held_item.getDynamicProperty("hatchi:bundlepack_data") as string
            if (typeof backpack_data_str === "string") {
                const backpack_data = JSON.parse(backpack_data_str) as ItemRepresentation[]

                const bundle_inventory = (bundlepack_entity.getComponent(EntityComponentTypes.Inventory) as EntityInventoryComponent)?.container
                if (bundle_inventory == undefined) {
                    console.error("inventory container undefined on bundlepack")
                    return
                }

                fillBundleInventory(backpack_data, bundle_inventory)
            }

        } else {
            const possible_entity = containers[bundlepack_id].entity
            if (possible_entity != undefined) {
                bundlepack_entity = possible_entity
            } else {
                console.error("Unable to find bundlepack container entity.")
                continue
            }
        }

        const tameableComponent = bundlepack_entity.getComponent("tameable")
        if (tameableComponent?.tamedToPlayerId !== player.id) {
            tameableComponent?.tame(player)
        }

        validEntityIds.push(bundlepack_entity.id)

        containers[bundlepack_id].in_use = true
        containers[bundlepack_id].last_used_by_player = player

        bundlepack_entity.teleport(player.getHeadLocation(), {
            dimension: player.dimension,
            keepVelocity: false,
        })

        const bundle_inventory = (bundlepack_entity.getComponent(EntityComponentTypes.Inventory) as EntityInventoryComponent)?.container
        if (bundle_inventory == undefined) {
            console.error("inventory container undefined on bundlepack")
            continue
        }

        const data: ItemRepresentation[] = []
        for (let slot = 0; slot < bundle_inventory.size; slot++) {
            const itemstack = bundle_inventory.getItem(slot)
            if (itemstack == undefined) {
                data.push(null)
                continue
            }
            const components = itemstack.getComponents()
            const item: ItemRepresentation = {
                typeId: itemstack.typeId,
                components: [],
                nameTag: itemstack.nameTag,
                amount: itemstack.amount ?? 1
            }
            for (const component of components) {
                const typeId = component.typeId
                if (typeId == "minecraft:enchantable") {
                    const component: EnchantableComponentRepresentation = {
                        typeId: "minecraft:enchantable",
                        enchantments: (itemstack.getComponent("enchantable") as ItemEnchantableComponent)?.getEnchantments().map(
                            (enchanment) => {
                                const type = (enchanment.type as EnchantmentType).id
                                return {
                                    type: type,
                                    level: enchanment.level
                                }
                            }
                        ) ?? []
                    }

                    item.components.push(component)
                } else if (typeId == "minecraft:durability") {
                    const component: DurabilityComponentRepresentation = {
                        typeId: "minecraft:durability",
                        damage: (itemstack.getComponent("durability") as ItemDurabilityComponent)?.damage
                    }

                    item.components.push(component)
                } else if (typeId == "minecraft:cooldown") {
                } else if (typeId == "minecraft:compostable") {
                } else if (typeId == "minecraft:dyeable") {
                    const component: DyeableComponentRepresentation = {
                        typeId: "minecraft:dyeable",
                        color: itemstack.getComponent("dyeable")?.color
                    }

                    item.components.push(component)
                } else {
                    if (!unhandledComponents[typeId]) {
                        console.error("unhandled item component: " + typeId)
                        unhandledComponents[typeId] = true
                    }
                }
            }
            const item_disallowed = disallowed_items.includes(itemstack.typeId) || itemstack.getDynamicPropertyIds().length > 0
            if (item_disallowed) {
                player.sendMessage(
                    [
                        { text: "§c[!] " },
                        { translate: "custom.hatchi.bundlepack.item_not_supported" }
                    ]
                )
                // console.log(JSON.stringify(components))
                player.playSound("note.bassattack")

                bundle_inventory.transferItem(slot, inventory)
                updateInventory(player)
            }
            data.push(item)
        }

        const inventory_data = JSON.stringify(data)

        held_item.setDynamicProperty("hatchi:bundlepack_data", inventory_data)
        inventory.setItem(player.selectedSlotIndex, held_item)
    }

    for (const container of Object.values(containers)) {
        if (!container.in_use) {
            const entity = container.entity
            if (entity == undefined || !entity.isValid) continue
            
            const new_pos = entity.location
            new_pos.y = 400
            entity.teleport(
                new_pos
            )

            if (container.last_used_by_player == null) continue

            const bundle_inventory = (entity.getComponent("inventory") as EntityInventoryComponent)?.container
            if (bundle_inventory == undefined) {
                console.error("inventory container undefined on bundlepack")
                continue
            }

            const player = container.last_used_by_player

            for (let slot = 0; slot < bundle_inventory.size; slot++) {
                const itemstack = bundle_inventory.getItem(slot)
                if (itemstack == undefined) {
                    continue
                }
                const item_disallowed = itemstack.hasTag("hatchi:bundlepack")
                if (item_disallowed) {
                    player.sendMessage(
                        [
                            { text: "§c[!] " },
                            { translate: "custom.hatchi.bundlepack.item_not_supported" }
                        ]
                    )
                    player.playSound("note.bassattack")

                    let inventory = (player.getComponent("inventory") as EntityInventoryComponent)?.container
                    if (inventory == undefined) {
                        throw Error("inventory container undefined on player")
                    }

                    bundle_inventory.transferItem(slot, inventory)
                    updateInventory(player)
                }
            }

        }
    }

    // remove any bundlepack entities that are not being tracked
    for (const dimension of dimensions) {
        const bundlepackEntities = dimension.getEntities(
            {
                type: "hatchi:bundlepack_container",
            }
        )
        for (const entity of bundlepackEntities) {
            if (!validEntityIds.includes(entity.id)) {
                console.log(validEntityIds, "removing entity", entity.id)
                entity.remove()
            }
        }
    }
}

// Used to update a player's inventory after an item has been transfered to them.
function updateInventory(player: Player) {
    let inventory = (player.getComponent("inventory") as EntityInventoryComponent)?.container
    if (inventory == undefined) {
        throw Error("inventory container undefined on player")
    }

    inventory.addItem(
        new ItemStack(
            "hatchi:false_air", 1
        )
    )
    player.runCommand("clear @s hatchi:false_air")
}

function fillBundleInventory(backpack_data: ItemRepresentation[], inventory: Container) {
    for (const [slot, item] of backpack_data.entries()) {
        if (item == null) continue


        const itemstack = new ItemStack(
            item.typeId
        )

        itemstack.amount = item.amount
        itemstack.nameTag = item.nameTag

        for (const component of item.components) {
            const typeId = component.typeId
            if (typeId == "minecraft:durability") {
                const representation = component as DurabilityComponentRepresentation

                let durability = itemstack.getComponent("minecraft:durability") as ItemDurabilityComponent
                if (durability == undefined) continue
                if (representation.damage == undefined) continue

                durability.damage = representation.damage
            } else if (typeId == "minecraft:enchantable") {
                const representation = component as EnchantableComponentRepresentation

                let enchantments = itemstack.getComponent("minecraft:enchantable") as ItemEnchantableComponent
                if (enchantments == undefined) continue
                for (const enchanment of representation.enchantments) {
                    enchantments.addEnchantment(
                        {
                            level: enchanment.level,
                            type: new EnchantmentType(enchanment.type)
                        }
                    )
                }
            } else {
                console.error("Unexpected component representation: " + typeId)
            }
        }

        inventory.setItem(
            slot,
            itemstack
        )
    }
}


// prevent right click for equiping backpacks
world.beforeEvents.itemUse.subscribe((event) => {
    if (event.itemStack.hasTag("hatchi:bundlepack")) {
        system.run(
            () => {
                const item = (event.source.getComponent("equippable") as EntityEquippableComponent)?.getEquipment(
                    EquipmentSlot.Chest
                )?.typeId
                if (item == undefined) {
                    (event.source.getComponent("equippable") as EntityEquippableComponent)?.setEquipment(
                        EquipmentSlot.Chest,
                        new ItemStack("minecraft:air")
                    )
                }
            }
        )
        return event.cancel = true
    }
})

init()
system.runInterval(tick, 1)