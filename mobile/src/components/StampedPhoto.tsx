import { forwardRef, type ComponentRef } from "react";
import { Image, StyleSheet, Text, View } from "react-native";

import { colors, fonts } from "../theme";

type Props = {
  uri: string;
  aspectRatio: number;
  width: number;
  lines: string[];
  onImageLoaded: () => void;
};

// Rendered off-screen and captured with react-native-view-shot to produce the stamped derivative.
export type StampedPhotoHandle = ComponentRef<typeof View>;

export const StampedPhoto = forwardRef<StampedPhotoHandle, Props>(function StampedPhoto(
  { uri, aspectRatio, width, lines, onImageLoaded },
  ref,
) {
  return (
    <View ref={ref} collapsable={false} style={{ width, aspectRatio, backgroundColor: "#000" }}>
      <Image
        source={{ uri }}
        style={StyleSheet.absoluteFill}
        resizeMode="contain"
        onLoadEnd={onImageLoaded}
      />
      <View style={styles.band}>
        {lines.map((line) => (
          <Text key={line} style={styles.line}>
            {line}
          </Text>
        ))}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  band: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: 10,
    backgroundColor: "transparent",
  },
  line: {
    color: "#FFFFFF",
    textAlign: "right",
    textShadowColor: "rgba(0,0,0,0.85)",
    textShadowOffset: {width: 1, height: 1},
    textShadowRadius: 2,
    fontFamily: fonts.medium,
    fontSize: 13,
    lineHeight: 18,
  },
});
