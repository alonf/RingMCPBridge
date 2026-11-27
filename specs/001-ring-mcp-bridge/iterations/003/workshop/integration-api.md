# Camera media handoff

**Status**: The owner confirmed the recipient policy on November 22 and asked to move on November 23. The camera API pilot and feature specification are planning inputs. The owner agreed to the photo and video recipient policy below.

## First acceptance test

1. An enabled camera reports a person. The callback identifies the event, camera and source household when applicable.
2. An MCP client asks for one or more JPEGs from that detection. Compare the returned capture times with the event time. If Ring is still preparing media, retry the same event. An unrelated latest snapshot cannot satisfy the test.
3. Approve the test service for the selected camera in household settings. The agent requests an event-image grant automatically. Verify that the service fetches the JPEG using its own identity and the capture time matches the detection. Check that another service cannot use the URL, that the approved service cannot obtain a grant for an unapproved camera, and that the grant cannot fetch another event or be used after expiry.
4. With the same camera and service approval, request a separate grant for the event clip. Verify that the service fetches the clip without a second owner prompt, that the photo grant cannot fetch the clip, and that the clip follows the camera’s audio setting.
5. Run the handoff first with a test receiver. Recognizing a visitor and announcing their arrival require separate acceptance tests.

## Agreed recipient policy for photos and video

In household settings, the owner approves each receiving service once per camera. This approval covers both photos and video clips. For each handoff, the service authenticates as itself and receives a short-lived grant limited to the selected item. The requesting agent keeps its own token. Camera media and audio settings apply to delegated reads.

The owner confirmed on November 22 that the same approval covers both formats. The JPEG fetch is the first integration milestone. The clip fetch tests reuse of that approval.

## Evidence and limits

The private app returned a JPEG for a post-link window. That test established the Ring download path. Event correlation, receiver authorization, and an actual fetch from a second service still need evidence. A separate face-recognition MCP is unnecessary for this first test.

[Requirements](../../../spec.md) · [Pilot and visitor scenario](../../../research.md) · [Iteration 002 review](../../002/review.md)
