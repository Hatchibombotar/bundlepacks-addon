import { readFileSync, writeFileSync } from "node:fs"
import process from "node:process"

const colors = [
    "black",
    "blue",
    "brown",
    "cyan",
    "gray",
    "green",
    "light_blue",
    "light_gray",
    "lime",
    "magenta",
    "orange",
    "pink",
    "purple",
    "red",
    "white",
    "yellow"
]

const itemTexture = JSON.parse(readFileSync("RP/textures/item_texture.json"))

const defaultAttachable = JSON.parse(readFileSync("RP/attachables/bundlepack.json"))

for (const colour of colors) {
    const item = {
        "format_version": "1.21.30",
        "minecraft:item": {
            "description": {
                "identifier": `hatchi:bundlepack_${colour}`,
                "menu_category": {
                    "category": "equipment"
                }
            },
            "components": {
                "minecraft:icon": {
                    "textures": {
                        "default": `bundlepack_${colour}`
                    }
                },
                "minecraft:max_stack_size": {
                    "value": 1
                },
                "minecraft:wearable": {
                    "slot": "slot.armor.chest"
                },
                "minecraft:tags": {
                    "tags": [
                        "hatchi:bundlepack",
                        "hatchi:back_item"
                    ]
                },
                "minecraft:allow_off_hand": true
            }
        }
    }

    const recipe = {
        "format_version": "1.21.30",
        "minecraft:recipe_shaped": {
            "description": {
                "identifier": `hatchi:bundlepack_recipe_${colour}`
            },
            "tags": [
                "crafting_table"
            ],
            "pattern": [
                "STS",
                "LDL",
                "LLL"
            ],
            "key": {
                "S": {
                    "item": "minecraft:string"
                },
                "T": {
                    "item": "minecraft:stick"
                },
                "L": {
                    "item": "minecraft:leather"
                },
                "D": {
                    item: `minecraft:${colour}_dye`
                }
            },
            "result": {
                "item": `hatchi:bundlepack_${colour}`
            },
            "unlock": {
                "context": "AlwaysUnlocked"
            }
        }
    }

    itemTexture.texture_data[`bundlepack_${colour}`] = {
        textures: `textures/bundlepacks/items/bundlepack_${colour}`
    }

    const attachable = JSON.parse(JSON.stringify(defaultAttachable))

    attachable["minecraft:attachable"].description.identifier = `hatchi:bundlepack_${colour}`
    attachable["minecraft:attachable"].description.textures.default = `textures/bundlepacks/attachables/bundlepack_${colour}`

    writeFileSync(`RP/attachables/bundlepack_${colour}.json`, JSON.stringify(attachable, null, 4))
    writeFileSync(`BP/recipes/bundlepack_${colour}.json`, JSON.stringify(recipe, null, 4))
    writeFileSync(`BP/items/bundlepack_${colour}.json`, JSON.stringify(item, null, 4))
}

writeFileSync("RP/textures/item_texture.json", JSON.stringify(itemTexture, null, 4))