# Legacy Status Mapping

| Legacy PHP status | New workflow state |
| --- | --- |
| `new` | `NEW` |
| `queued` | `QUEUED` |
| `ideas_ready` | `IDEAS_READY` |
| `idea_selected` | `IDEA_SELECTED` |
| `gaps_ready` | `GAPS_READY` |
| `drafted` | `DRAFTED` |
| `reviewed` | `REVIEWED` |
| `image_ready` | `IMAGE_READY` |
| `duplicate` | `DUPLICATE` |
| `error` | `FAILED` |
| `published` | `PUBLISHED` |

Migration must preserve the previous valid state separately from a failure state when legacy `last_action` and `error_message` are present.
