---
'@platforma-open/milaboratories.generation-probability.model': minor
'@platforma-open/milaboratories.generation-probability.block': minor
'@platforma-open/milaboratories.generation-probability.workflow': patch
'@platforma-open/milaboratories.generation-probability.software': patch
---

Migrate onto the structurer and take the full SDK upgrade (block-tools 2.14.3, tengo-builder 4.0.23, model 1.83.0, ui-vue 1.83.3).

Adds the mandatory block kind. Its init-params contract is the input dataset plus the species, so a project template can seed a configured Generation Probability block.
