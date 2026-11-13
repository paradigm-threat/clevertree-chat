#!/bin/sh
# Dry run only. Prints the Rackspace Spot calls for the comments batch.
# Org paradigmthreat. Region us-west-sjc-1. About $0.15/hr.
# Does not create a cloudspace. Does not contact the network.
# CLEVERTREE_SPOT_WAKE is reserved for a later real wake. It is unset.
# This script does not read it and does not boot hardware.
echo 'createCloudspace name=clevertree-chat-comments org=paradigmthreat region=us-west-sjc-1'
echo 'createSpotNodePool name=clevertree-chat-comments class=gpu.vs2.xlargeplusplus-sjc region=us-west-sjc-1 price=$0.15/hr'
