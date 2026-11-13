#!/bin/sh
# Dry run only. Prints the shutdown calls after the comments queue is drained.
# A pool left at desired=0 is not the idle state. Does not contact the network.
# CLEVERTREE_SPOT_WAKE is reserved for a later real wake. It is unset.
# This script does not read it and does not boot hardware.
echo 'deleteSpotNodePool name=clevertree-chat-comments org=paradigmthreat region=us-west-sjc-1'
echo 'deleteCloudspace name=clevertree-chat-comments org=paradigmthreat region=us-west-sjc-1'
